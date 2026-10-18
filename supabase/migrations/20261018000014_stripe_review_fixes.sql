-- Review fixes for the Stripe slice.
--  * attach_checkout_session / fail_payment_request become SERVICE-ROLE ONLY (the API route calls them after the provider
--    call). A user could otherwise bind a foreign provider session to their own request or fail it with free text.
--    Failure reasons are a fixed set of codes (no provider text, which can contain key fragments).
--  * create_payment_request also needs crm.view (it is SECURITY DEFINER and ignores opportunity RLS).
--  * apply_stripe_event: the session's metadata.payment_request_id must match the request we looked up; paid clears a stale reason.
--  * rejected webhooks dedupe by payload hash (counted) and are pruned, so a bad-signature flood cannot grow the table.
--  * orphaned pending requests (no session after 15 minutes) are failed by a cron sweep, never left silently pending.

-- 1. service-role-only attach / fail -------------------------------------------------------------------------------
drop function public.attach_checkout_session(uuid, uuid, text, text);
drop function private.attach_checkout_session(uuid, uuid, text, text);
drop function public.fail_payment_request(uuid, uuid, text);
drop function private.fail_payment_request(uuid, uuid, text);

create function private.attach_checkout_session(p_request uuid, p_session text, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_session !~ '^cs_(test|live)_[A-Za-z0-9]+$' or p_url !~ '^https://checkout\.stripe\.com/' then
    raise exception 'invalid checkout session' using errcode = '22023';
  end if;
  update public.payment_requests set checkout_session_id = p_session, checkout_url = p_url, updated_at = now()
   where id = p_request and status = 'pending' and checkout_session_id is null;
  if not found then raise exception 'payment request not found' using errcode = 'P0002'; end if;
end $$;

create function private.fail_payment_request(p_request uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  if p_code not in ('stripe_rejected', 'stripe_unreachable', 'stripe_not_configured', 'attach_failed', 'abandoned', 'provider_error') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  update public.payment_requests
     set status = 'failed', failure_reason = p_code, updated_at = now()
   where id = p_request and status = 'pending' and checkout_session_id is null
  returning workspace_id into v_ws;
  if not found then raise exception 'payment request not found' using errcode = 'P0002'; end if;
  perform private.append_audit(v_ws, null, 'payment.failed', 'payment_request', p_request::text, null, null);
end $$;

create function public.attach_checkout_session(p_request uuid, p_session text, p_url text) returns void
language sql security invoker set search_path = '' as $$ select private.attach_checkout_session(p_request, p_session, p_url); $$;
create function public.fail_payment_request(p_request uuid, p_code text) returns void
language sql security invoker set search_path = '' as $$ select private.fail_payment_request(p_request, p_code); $$;

revoke execute on function
  private.attach_checkout_session(uuid, text, text), private.fail_payment_request(uuid, text),
  public.attach_checkout_session(uuid, text, text), public.fail_payment_request(uuid, text)
from public, anon, authenticated;
grant execute on function
  private.attach_checkout_session(uuid, text, text), private.fail_payment_request(uuid, text),
  public.attach_checkout_session(uuid, text, text), public.fail_payment_request(uuid, text)
to service_role;

-- hygiene: the webhook functions are not executable by authenticated even through the private schema
revoke execute on function private.apply_stripe_event(text, text, text, jsonb), private.record_rejected_webhook(text, text, text) from public, anon, authenticated;

-- 2. create_payment_request needs crm.view ---------------------------------------------------------------------------
create or replace function private.create_payment_request(p_workspace uuid, p_opportunity uuid, p_amount_minor bigint, p_currency text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'payment.create');
  v_contact uuid;
  v_id uuid;
  v_currency text := upper(coalesce(nullif(btrim(p_currency), ''), 'USD'));
begin
  if not private.has_workspace_permission(p_workspace, 'crm.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select contact_id into v_contact from public.opportunities
   where id = p_opportunity and workspace_id = p_workspace and archived_at is null;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  if p_amount_minor is null or p_amount_minor < 50 or p_amount_minor > 99999999 or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  insert into public.payment_requests (workspace_id, opportunity_id, contact_id, amount_minor, currency, created_by)
  values (p_workspace, p_opportunity, v_contact, p_amount_minor, v_currency, v_uid) returning id into v_id;
  perform private.log_activity(p_workspace, v_contact, p_opportunity, 'payment', v_uid, 'Payment requested', jsonb_build_object('payment_request_id', v_id));
  perform private.append_audit(p_workspace, v_uid, 'payment.requested', 'payment_request', v_id::text, null, null);
  return v_id;
end $$;

-- 3. rejected webhooks: dedupe by payload hash, count, prune ----------------------------------------------------------
create unique index integration_events_rejected_dedupe on public.integration_events (provider, payload_hash) where status = 'rejected';

create or replace function private.record_rejected_webhook(p_provider text, p_payload_hash text, p_reason text)
returns void language sql security definer set search_path = '' as $$
  insert into public.integration_events (provider, status, detail, payload_hash)
  values (p_provider, 'rejected', left(p_reason, 200), left(p_payload_hash, 128))
  on conflict (provider, payload_hash) where status = 'rejected' do update set deliveries = public.integration_events.deliveries + 1;
$$;

-- 4. apply_stripe_event: metadata match, clear stale reason on paid ---------------------------------------------------
create or replace function private.apply_stripe_event(p_event_id text, p_type text, p_payload_hash text, p_obj jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  v_req public.payment_requests;
  v_result text := 'processed';
  v_detail text;
  v_status text := 'processed';
  v_session text;
  v_pi text;
  v_refunded bigint;
  v_meta uuid;
  r jsonb;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' then raise exception 'invalid event id' using errcode = '22023'; end if;

  insert into public.integration_events (provider, event_id, event_type, status, payload_hash)
  values ('stripe', p_event_id, left(p_type, 80), 'processed', p_payload_hash)
  on conflict (provider, event_id) where event_id is not null do nothing
  returning id into v_event;
  if v_event is null then
    update public.integration_events set deliveries = deliveries + 1 where provider = 'stripe' and event_id = p_event_id;
    return 'duplicate';
  end if;

  v_session := p_obj ->> 'id';
  v_pi := p_obj ->> 'payment_intent';

  if p_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    select * into v_req from public.payment_requests where checkout_session_id = v_session for update;
    if not found then
      v_status := 'ignored'; v_detail := 'unknown checkout session'; v_result := 'ignored';
    elsif coalesce(p_obj -> 'metadata' ->> 'payment_request_id', '') <> v_req.id::text then
      v_status := 'failed'; v_detail := 'session metadata does not match the request'; v_result := 'mismatch';
    elsif p_obj ->> 'payment_status' <> 'paid' then
      v_status := 'ignored'; v_detail := 'not paid yet'; v_result := 'ignored';
    elsif (p_obj ->> 'amount_total')::bigint is distinct from v_req.amount_minor or upper(p_obj ->> 'currency') is distinct from v_req.currency then
      update public.payment_requests set status = 'failed', failure_reason = 'amount_mismatch', updated_at = now() where id = v_req.id and status = 'pending';
      v_status := 'failed'; v_detail := 'provider amount differs from the snapshot'; v_result := 'mismatch';
    elsif v_req.status = 'pending' then
      update public.payment_requests set status = 'paid', paid_at = now(), payment_intent_id = v_pi, failure_reason = null, updated_at = now() where id = v_req.id;
      perform private.log_activity(v_req.workspace_id, v_req.contact_id, v_req.opportunity_id, 'payment', null, 'Payment received', jsonb_build_object('payment_request_id', v_req.id));
      perform private.append_audit(v_req.workspace_id, null, 'payment.paid', 'payment_request', v_req.id::text, null, null);
    else
      v_status := 'ignored'; v_detail := 'already ' || v_req.status; v_result := 'ignored';
    end if;

  elsif p_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then
    select * into v_req from public.payment_requests where checkout_session_id = v_session for update;
    if not found then
      v_status := 'ignored'; v_detail := 'unknown checkout session'; v_result := 'ignored';
    elsif v_req.status = 'pending' then
      update public.payment_requests
         set status = case when p_type = 'checkout.session.expired' then 'expired' else 'failed' end,
             failure_reason = case when p_type = 'checkout.session.expired' then null else 'async_payment_failed' end, updated_at = now()
       where id = v_req.id;
      perform private.log_activity(v_req.workspace_id, v_req.contact_id, v_req.opportunity_id, 'payment', null,
        case when p_type = 'checkout.session.expired' then 'Payment link expired' else 'Payment failed' end, jsonb_build_object('payment_request_id', v_req.id));
      perform private.append_audit(v_req.workspace_id, null, case when p_type = 'checkout.session.expired' then 'payment.expired' else 'payment.failed' end, 'payment_request', v_req.id::text, null, null);
    else
      v_status := 'ignored'; v_detail := 'already ' || v_req.status; v_result := 'ignored';
    end if;

  elsif p_type = 'payment_intent.payment_failed' then
    begin v_meta := (p_obj -> 'metadata' ->> 'payment_request_id')::uuid; exception when others then v_meta := null; end;
    select * into v_req from public.payment_requests where id = v_meta for update;
    if not found then
      v_status := 'ignored'; v_detail := 'unknown payment'; v_result := 'ignored';
    elsif v_req.status = 'pending' then
      -- a declined card can be retried inside the same Checkout session, so this is recorded but the request stays pending
      update public.payment_requests set failure_reason = left(coalesce(p_obj -> 'last_payment_error' ->> 'code', 'card_declined'), 100), updated_at = now() where id = v_req.id;
      perform private.append_audit(v_req.workspace_id, null, 'payment.attempt_failed', 'payment_request', v_req.id::text, null, null);
    else
      v_status := 'ignored'; v_detail := 'already ' || v_req.status; v_result := 'ignored';
    end if;

  elsif p_type = 'charge.refunded' then
    select * into v_req from public.payment_requests where payment_intent_id = v_pi for update;
    if not found or v_req.status not in ('paid', 'partially_refunded', 'refunded') then
      v_status := 'ignored'; v_detail := 'no matching paid payment'; v_result := 'ignored';
    else
      -- cumulative amount_refunded is authoritative; the per-refund list is stored when the event carries it
      v_refunded := least(greatest(coalesce((p_obj ->> 'amount_refunded')::bigint, 0), v_req.refunded_minor), v_req.amount_minor);
      update public.payment_requests
         set refunded_minor = v_refunded,
             status = case when v_refunded >= amount_minor then 'refunded' else 'partially_refunded' end, updated_at = now()
       where id = v_req.id;
      for r in select * from jsonb_array_elements(coalesce(p_obj -> 'refunds' -> 'data', '[]'::jsonb)) loop
        if r ->> 'status' = 'succeeded' and (r ->> 'id') ~ '^re_[A-Za-z0-9_]+$' and (r ->> 'amount')::bigint > 0 then
          insert into public.payment_refunds (workspace_id, payment_request_id, stripe_refund_id, amount_minor)
          values (v_req.workspace_id, v_req.id, r ->> 'id', (r ->> 'amount')::bigint) on conflict (stripe_refund_id) do nothing;
        end if;
      end loop;
      perform private.log_activity(v_req.workspace_id, v_req.contact_id, v_req.opportunity_id, 'payment', null, 'Payment refunded', jsonb_build_object('payment_request_id', v_req.id));
      perform private.append_audit(v_req.workspace_id, null, 'payment.refunded', 'payment_request', v_req.id::text, null, null);
    end if;

  else
    v_status := 'ignored'; v_detail := 'event type not handled'; v_result := 'ignored';
  end if;

  update public.integration_events set status = v_status, detail = v_detail, workspace_id = v_req.workspace_id where id = v_event;
  return v_result;
end $$;

-- 5. cron: fail abandoned pending requests, prune old rejected deliveries ----------------------------------------------
select cron.schedule('fail-abandoned-payments', '*/5 * * * *', $$
  update public.payment_requests set status = 'failed', failure_reason = 'abandoned', updated_at = now()
   where status = 'pending' and checkout_session_id is null and created_at < now() - interval '15 minutes'
$$);
select cron.schedule('prune-rejected-webhooks', '17 3 * * *', $$
  delete from public.integration_events where status = 'rejected' and created_at < now() - interval '30 days'
$$);

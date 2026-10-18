-- Stripe payments (I2). Checkout is created server-side; ONLY a signed webhook (applied through
-- private.apply_stripe_event, service role only) can mark a payment paid, failed, expired or refunded.
-- Amounts are snapshotted in minor units at request time and re-checked against the provider's amount.
-- Money never goes into audit/activity text (those are visible to people without opportunity.value.view).

create table public.payment_requests (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  opportunity_id      uuid not null,
  contact_id          uuid not null,
  amount_minor        bigint not null check (amount_minor between 50 and 99999999),
  currency            text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status              text not null default 'pending'
                      check (status in ('pending', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded')),
  checkout_session_id text unique,
  checkout_url        text,
  payment_intent_id   text unique,
  refunded_minor      bigint not null default 0,
  failure_reason      text check (char_length(failure_reason) <= 200),
  created_by          uuid not null references auth.users (id),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  updated_at          timestamptz not null default now(),
  unique (workspace_id, id),
  check (refunded_minor between 0 and amount_minor),
  foreign key (workspace_id, opportunity_id) references public.opportunities (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id)
);
create index payment_requests_ws_idx on public.payment_requests (workspace_id, created_at desc);

create table public.payment_refunds (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null,
  payment_request_id uuid not null,
  stripe_refund_id   text not null unique,
  amount_minor       bigint not null check (amount_minor > 0),
  created_at         timestamptz not null default now(),
  foreign key (workspace_id, payment_request_id) references public.payment_requests (workspace_id, id) on delete cascade
);

-- One row per provider event (dedupe key) plus rejected deliveries (payload hash only). Visible to integrations.manage.
create table public.integration_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  provider     text not null check (provider in ('stripe', 'google', 'email')),
  event_id     text,
  event_type   text,
  status       text not null check (status in ('processed', 'ignored', 'rejected', 'failed')),
  detail       text check (char_length(detail) <= 300),
  payload_hash text,
  deliveries   int not null default 1,
  created_at   timestamptz not null default now()
);
create unique index integration_events_dedupe on public.integration_events (provider, event_id) where event_id is not null;
create index integration_events_ws_idx on public.integration_events (workspace_id, created_at desc);

alter table public.payment_requests enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.integration_events enable row level security;
revoke all on public.payment_requests, public.payment_refunds, public.integration_events from anon, authenticated;
grant select on public.payment_requests, public.payment_refunds to authenticated;
grant select on public.integration_events to authenticated;

create policy payment_requests_select on public.payment_requests for select to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'payment.create'))
      or (select private.has_workspace_permission(workspace_id, 'opportunity.value.view')));
create policy payment_refunds_select on public.payment_refunds for select to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'payment.create'))
      or (select private.has_workspace_permission(workspace_id, 'opportunity.value.view')));
create policy integration_events_select on public.integration_events for select to authenticated
  using (workspace_id is not null and (select private.has_workspace_permission(workspace_id, 'integrations.manage')));

-- ---------------------------------------------------------------- user-facing functions
create function private.create_payment_request(p_workspace uuid, p_opportunity uuid, p_amount_minor bigint, p_currency text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'payment.create');
  v_contact uuid;
  v_id uuid;
  v_currency text := upper(coalesce(nullif(btrim(p_currency), ''), 'USD'));
begin
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

create function private.attach_checkout_session(p_workspace uuid, p_request uuid, p_session text, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission(p_workspace, 'payment.create');
  if p_session !~ '^cs_(test|live)_[A-Za-z0-9]+$' or p_url !~ '^https://checkout\.stripe\.com/' then
    raise exception 'invalid checkout session' using errcode = '22023';
  end if;
  update public.payment_requests set checkout_session_id = p_session, checkout_url = p_url, updated_at = now()
   where id = p_request and workspace_id = p_workspace and status = 'pending' and checkout_session_id is null;
  if not found then raise exception 'payment request not found' using errcode = 'P0002'; end if;
end $$;

-- the provider call failed before a session existed: surface it, never leave a silent pending row
create function private.fail_payment_request(p_workspace uuid, p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'payment.create');
begin
  update public.payment_requests
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'provider_error'), 200), updated_at = now()
   where id = p_request and workspace_id = p_workspace and status = 'pending' and checkout_session_id is null;
  if not found then raise exception 'payment request not found' using errcode = 'P0002'; end if;
  perform private.append_audit(p_workspace, v_uid, 'payment.failed', 'payment_request', p_request::text, null, null);
end $$;

-- Collected = verified gross of payments paid this month (workspace time zone) minus confirmed refunds. Money: value permission.
create function private.collected_summary(p_workspace uuid)
returns table (currency text, collected_minor bigint, paid_count bigint, refunded_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  perform private.require_permission(p_workspace, 'opportunity.value.view');
  select timezone into v_tz from public.workspaces where id = p_workspace;
  return query
    select pr.currency, (sum(pr.amount_minor) - sum(pr.refunded_minor))::bigint, count(*), sum(pr.refunded_minor)::bigint
    from public.payment_requests pr
    where pr.workspace_id = p_workspace and pr.paid_at is not null
      and date_trunc('month', pr.paid_at at time zone coalesce(v_tz, 'UTC')) = date_trunc('month', now() at time zone coalesce(v_tz, 'UTC'))
    group by pr.currency;
end $$;

-- ---------------------------------------------------------------- webhook applier (service role only)
create function private.apply_stripe_event(p_event_id text, p_type text, p_payload_hash text, p_obj jsonb)
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
    elsif p_obj ->> 'payment_status' <> 'paid' then
      v_status := 'ignored'; v_detail := 'not paid yet'; v_result := 'ignored';
    elsif (p_obj ->> 'amount_total')::bigint is distinct from v_req.amount_minor or upper(p_obj ->> 'currency') is distinct from v_req.currency then
      update public.payment_requests set status = 'failed', failure_reason = 'amount_mismatch', updated_at = now() where id = v_req.id and status = 'pending';
      v_status := 'failed'; v_detail := 'provider amount differs from the snapshot'; v_result := 'mismatch';
    elsif v_req.status = 'pending' then
      update public.payment_requests set status = 'paid', paid_at = now(), payment_intent_id = v_pi, updated_at = now() where id = v_req.id;
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

create function private.record_rejected_webhook(p_provider text, p_payload_hash text, p_reason text)
returns void language sql security definer set search_path = '' as $$
  insert into public.integration_events (provider, status, detail, payload_hash)
  values (p_provider, 'rejected', left(p_reason, 200), left(p_payload_hash, 128));
$$;

-- ---------------------------------------------------------------- grants and wrappers
grant execute on function
  private.create_payment_request(uuid, uuid, bigint, text),
  private.attach_checkout_session(uuid, uuid, text, text),
  private.fail_payment_request(uuid, uuid, text),
  private.collected_summary(uuid)
to authenticated;
grant execute on function private.apply_stripe_event(text, text, text, jsonb), private.record_rejected_webhook(text, text, text) to service_role;
grant usage on schema private to service_role;

create function public.create_payment_request(p_workspace uuid, p_opportunity uuid, p_amount_minor bigint, p_currency text) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_payment_request(p_workspace, p_opportunity, p_amount_minor, p_currency); $$;
create function public.attach_checkout_session(p_workspace uuid, p_request uuid, p_session text, p_url text) returns void
language sql security invoker set search_path = '' as $$ select private.attach_checkout_session(p_workspace, p_request, p_session, p_url); $$;
create function public.fail_payment_request(p_workspace uuid, p_request uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select private.fail_payment_request(p_workspace, p_request, p_reason); $$;
create function public.collected_summary(p_workspace uuid) returns table (currency text, collected_minor bigint, paid_count bigint, refunded_minor bigint)
language sql stable security invoker set search_path = '' as $$ select * from private.collected_summary(p_workspace); $$;
create function public.apply_stripe_event(p_event_id text, p_type text, p_payload_hash text, p_obj jsonb) returns text
language sql security invoker set search_path = '' as $$ select private.apply_stripe_event(p_event_id, p_type, p_payload_hash, p_obj); $$;
create function public.record_rejected_webhook(p_provider text, p_payload_hash text, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select private.record_rejected_webhook(p_provider, p_payload_hash, p_reason); $$;

revoke execute on function
  public.create_payment_request(uuid, uuid, bigint, text), public.attach_checkout_session(uuid, uuid, text, text),
  public.fail_payment_request(uuid, uuid, text), public.collected_summary(uuid),
  public.apply_stripe_event(text, text, text, jsonb), public.record_rejected_webhook(text, text, text)
from public, anon, authenticated;
grant execute on function
  public.create_payment_request(uuid, uuid, bigint, text), public.attach_checkout_session(uuid, uuid, text, text),
  public.fail_payment_request(uuid, uuid, text), public.collected_summary(uuid)
to authenticated;
grant execute on function public.apply_stripe_event(text, text, text, jsonb), public.record_rejected_webhook(text, text, text) to service_role;
revoke execute on function
  private.create_payment_request(uuid, uuid, bigint, text), private.attach_checkout_session(uuid, uuid, text, text),
  private.fail_payment_request(uuid, uuid, text), private.collected_summary(uuid),
  private.apply_stripe_event(text, text, text, jsonb), private.record_rejected_webhook(text, text, text)
from public, anon;

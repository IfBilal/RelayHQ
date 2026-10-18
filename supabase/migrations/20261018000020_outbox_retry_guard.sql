-- Review fixes for the integrations center.
--  * outbox_events.last_attempt_at: when a send last ran (set by finish_outbox), so "needs attention" compares real times.
--  * retry_outbox_event: 60 s cooldown per alert (P0429) so a retry cannot be used to repeat sends quickly; the audit row
--    records the previous status and attempt count.
alter table public.outbox_events add column last_attempt_at timestamptz;
grant select (last_attempt_at) on public.outbox_events to authenticated;

create or replace function private.finish_outbox(p_id uuid, p_ok boolean, p_reference text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_attempts int;
begin
  select attempts into v_attempts from public.outbox_events where id = p_id for update;
  if p_ok then
    update public.outbox_events set status = 'sent', sent_at = now(), last_attempt_at = now(), provider_reference = p_reference, last_error = null, lease_until = null where id = p_id;
  elsif v_attempts >= 4 then
    update public.outbox_events set status = 'dead', last_attempt_at = now(), last_error = left(p_error, 500), lease_until = null where id = p_id;
  else
    -- bounded exponential backoff: 5s, 20s, 80s
    update public.outbox_events set status = 'failed', last_attempt_at = now(), last_error = left(p_error, 500), lease_until = null,
           next_attempt_at = now() + make_interval(secs => 5 * power(4, v_attempts - 1)::int) where id = p_id;
  end if;
end $$;

create or replace function private.retry_outbox_event(p_workspace uuid, p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'integrations.manage');
  v_old public.outbox_events;
begin
  if exists (select 1 from public.audit_events
              where workspace_id = p_workspace and action = 'integration.alert_retried' and entity_id = p_event::text
                and created_at > now() - interval '60 seconds') then
    raise exception 'retried too recently' using errcode = 'P0429';
  end if;
  select * into v_old from public.outbox_events where id = p_event and workspace_id = p_workspace and status in ('failed', 'dead') for update;
  if not found then raise exception 'alert not found or not retryable' using errcode = 'P0002'; end if;
  update public.outbox_events set status = 'pending', attempts = 0, next_attempt_at = now(), lease_until = null where id = p_event;
  perform private.append_audit(p_workspace, v_uid, 'integration.alert_retried', 'outbox_event', p_event::text, null,
    jsonb_build_object('previous_status', v_old.status, 'previous_attempts', v_old.attempts));
end $$;

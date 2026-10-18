-- Integrations center: let integrations.manage holders re-queue a failed or dead alert (bounded: attempts restart at 0,
-- so the normal backoff and the 4-attempt cap apply again). Tenant-scoped, audited, no payload exposure.
create function private.retry_outbox_event(p_workspace uuid, p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'integrations.manage');
begin
  update public.outbox_events
     set status = 'pending', attempts = 0, next_attempt_at = now(), lease_until = null
   where id = p_event and workspace_id = p_workspace and status in ('failed', 'dead');
  if not found then raise exception 'alert not found or not retryable' using errcode = 'P0002'; end if;
  perform private.append_audit(p_workspace, v_uid, 'integration.alert_retried', 'outbox_event', p_event::text, null, null);
end $$;

revoke execute on function private.retry_outbox_event(uuid, uuid) from public, anon;
grant execute on function private.retry_outbox_event(uuid, uuid) to authenticated;

create function public.retry_outbox_event(p_workspace uuid, p_event uuid) returns void
language sql security invoker set search_path = '' as $$ select private.retry_outbox_event(p_workspace, p_event); $$;
revoke execute on function public.retry_outbox_event(uuid, uuid) from public, anon;
grant execute on function public.retry_outbox_event(uuid, uuid) to authenticated;

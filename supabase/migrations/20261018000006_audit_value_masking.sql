-- F1.4 fix: the audit log must never carry opportunity money. Anyone with audit.view could
-- read value_minor from audit_events and bypass opportunity.value.view.

-- 1. Log only that the value changed, never the amounts.
create or replace function private.set_opportunity_value(p_workspace uuid, p_opportunity uuid, p_value_minor bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'opportunity.value.view'); v_contact uuid;
begin
  select contact_id into v_contact from public.opportunities where id = p_opportunity and workspace_id = p_workspace and archived_at is null;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  insert into private.opportunity_financials (opportunity_id, workspace_id, value_minor) values (p_opportunity, p_workspace, p_value_minor)
    on conflict (opportunity_id) do update set value_minor = excluded.value_minor;
  perform private.log_activity(p_workspace, v_contact, p_opportunity, 'field_edit', v_uid, 'Value changed', '{}');
  perform private.append_audit(p_workspace, v_uid, 'opportunity.value_changed', 'opportunity', p_opportunity::text,
    null, jsonb_build_object('changed', true));
end $$;

-- 2. One-off scrub of rows already written. The append-only trigger is disabled only for this
--    statement inside this transaction and re-enabled before commit (verified below).
alter table public.audit_events disable trigger audit_events_no_update;
update public.audit_events
   set before = null, after = jsonb_build_object('changed', true)
 where action = 'opportunity.value_changed';
alter table public.audit_events enable trigger audit_events_no_update;

do $$
begin
  if exists (select 1 from public.audit_events where before::text like '%value_minor%' or after::text like '%value_minor%') then
    raise exception 'value_minor still present in audit_events';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.audit_events'::regclass and tgname = 'audit_events_no_update' and tgenabled = 'O') then
    raise exception 'append-only trigger not re-enabled';
  end if;
end $$;

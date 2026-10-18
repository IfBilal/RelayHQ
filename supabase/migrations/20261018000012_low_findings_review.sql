-- Review follow-ups for migration 11.
--  * revoke_invitation: apply the same role ceiling as invite_member (a non-Owner cannot revoke an invitation
--    into a role broader than their own).
--  * hygiene: the new private functions get no default PUBLIC/anon execute.
create or replace function private.revoke_invitation(p_workspace uuid, p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invitations;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not private.has_workspace_permission(p_workspace, 'team.invite') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations
   where id = p_invitation and workspace_id = p_workspace and accepted_at is null for update;
  if not found then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  -- Admin-level invitations are the Owner's to revoke; otherwise the invited role must be within the caller's own permissions
  if not private.is_workspace_owner(p_workspace) and (
       v_inv.base_role = 'admin' or not private.role_within_caller(p_workspace, v_inv.permission_role_id)
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.invitations where id = p_invitation;
  perform private.append_audit(p_workspace, v_uid, 'member.invite_revoked', 'invitation', p_invitation::text, null,
    jsonb_build_object('base_role', v_inv.base_role, 'permission_role_id', v_inv.permission_role_id));
end $$;

revoke execute on function private.revoke_invitation(uuid, uuid), private.set_notification_email(text) from public, anon;
grant execute on function private.revoke_invitation(uuid, uuid), private.set_notification_email(text) to authenticated;

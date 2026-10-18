-- Google Calendar (I3). OAuth tokens are encrypted by the server and stored in a table with NO API grants;
-- only two service-role-only wrappers touch them. Appointments store UTC instants + the IANA zone they were booked in.

create table private.calendar_tokens (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  cipher       text not null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
revoke all on private.calendar_tokens from public, anon, authenticated;

create table public.calendar_connections (
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  google_email    text,
  status          text not null default 'connected' check (status in ('connected','revoked','error')),
  last_error      text check (char_length(last_error) <= 200),
  last_success_at timestamptz,
  connected_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  contact_id       uuid not null,
  employee_user_id uuid not null references auth.users (id),
  purpose          text not null check (char_length(purpose) between 1 and 120),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  timezone         text not null,
  status           text not null default 'pending' check (status in ('pending','confirmed','cancelled','error')),
  google_event_id  text,
  last_error       text check (char_length(last_error) <= 200),
  created_by       uuid not null references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, id),
  check (ends_at > starts_at),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id)
);
create index appointments_ws_idx on public.appointments (workspace_id, starts_at);

alter table public.calendar_connections enable row level security;
alter table public.appointments enable row level security;
revoke all on public.calendar_connections, public.appointments from anon, authenticated;
grant select on public.calendar_connections, public.appointments to authenticated;
create policy calendar_connections_select on public.calendar_connections for select to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'appointment.view')));
create policy appointments_select on public.appointments for select to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'appointment.view')));

-- service-role only token access, workspace scoped
create function public.store_calendar_tokens(p_workspace uuid, p_user uuid, p_cipher text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships where workspace_id = p_workspace and user_id = p_user and enabled) then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  insert into private.calendar_tokens (workspace_id, user_id, cipher) values (p_workspace, p_user, p_cipher)
    on conflict (workspace_id, user_id) do update set cipher = excluded.cipher, updated_at = now();
  insert into public.calendar_connections (workspace_id, user_id, google_email, status, last_error, last_success_at)
    values (p_workspace, p_user, p_email, 'connected', null, now())
    on conflict (workspace_id, user_id) do update set google_email = excluded.google_email, status = 'connected', last_error = null, last_success_at = now(), connected_at = now();
  perform private.append_audit(p_workspace, p_user, 'calendar.connected', 'calendar_connection', p_user::text, null, jsonb_build_object('email', p_email));
end $$;

create function public.read_calendar_tokens(p_workspace uuid, p_user uuid)
returns text language sql security definer set search_path = '' as $$
  select cipher from private.calendar_tokens where workspace_id = p_workspace and user_id = p_user;
$$;

create function public.set_calendar_status(p_workspace uuid, p_user uuid, p_status text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.calendar_connections set status = p_status, last_error = left(p_error, 200),
    last_success_at = case when p_status = 'connected' then now() else last_success_at end
   where workspace_id = p_workspace and user_id = p_user;
  if p_status = 'revoked' then delete from private.calendar_tokens where workspace_id = p_workspace and user_id = p_user; end if;
end $$;

revoke all on function public.store_calendar_tokens(uuid, uuid, text, text), public.read_calendar_tokens(uuid, uuid), public.set_calendar_status(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.store_calendar_tokens(uuid, uuid, text, text), public.read_calendar_tokens(uuid, uuid), public.set_calendar_status(uuid, uuid, text, text) to service_role;

-- user-facing
create function private.disconnect_calendar(p_workspace uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'appointment.create');
begin
  delete from private.calendar_tokens where workspace_id = p_workspace and user_id = v_uid;
  delete from public.calendar_connections where workspace_id = p_workspace and user_id = v_uid;
  perform private.append_audit(p_workspace, v_uid, 'calendar.disconnected', 'calendar_connection', v_uid::text, null, null);
end $$;

create function private.book_appointment(p_workspace uuid, p_contact uuid, p_employee uuid, p_purpose text, p_starts timestamptz, p_ends timestamptz, p_tz text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'appointment.create'); v_id uuid;
begin
  if not exists (select 1 from public.contacts where id = p_contact and workspace_id = p_workspace) then raise exception 'contact not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.memberships where workspace_id = p_workspace and user_id = p_employee and enabled) then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if p_ends <= p_starts or p_ends - p_starts > interval '8 hours' then raise exception 'invalid time range' using errcode = '22023'; end if;
  if exists (select 1 from public.appointments where workspace_id = p_workspace and employee_user_id = p_employee and status in ('pending','confirmed') and starts_at < p_ends and ends_at > p_starts) then
    raise exception 'employee already booked in that slot' using errcode = 'P0409';
  end if;
  insert into public.appointments (workspace_id, contact_id, employee_user_id, purpose, starts_at, ends_at, timezone, created_by)
    values (p_workspace, p_contact, p_employee, btrim(p_purpose), p_starts, p_ends, p_tz, v_uid) returning id into v_id;
  perform private.log_activity(p_workspace, p_contact, null, 'appointment', v_uid, 'Appointment booked: ' || btrim(p_purpose), jsonb_build_object('appointment_id', v_id));
  perform private.acknowledge_via_action(p_workspace, p_contact, v_uid);
  perform private.append_audit(p_workspace, v_uid, 'appointment.booked', 'appointment', v_id::text, null, jsonb_build_object('starts_at', p_starts, 'employee', p_employee));
  return v_id;
end $$;

create function private.finish_appointment(p_workspace uuid, p_id uuid, p_status text, p_event_id text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'appointment.create');
begin
  if p_status not in ('confirmed','cancelled','error') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.appointments set status = p_status, google_event_id = coalesce(p_event_id, google_event_id), last_error = left(p_error, 200), updated_at = now()
   where id = p_id and workspace_id = p_workspace;
  if not found then raise exception 'appointment not found' using errcode = 'P0002'; end if;
  perform private.append_audit(p_workspace, v_uid, 'appointment.' || p_status, 'appointment', p_id::text, null, null);
end $$;

create function private.reschedule_appointment(p_workspace uuid, p_id uuid, p_starts timestamptz, p_ends timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'appointment.create'); v_emp uuid;
begin
  select employee_user_id into v_emp from public.appointments where id = p_id and workspace_id = p_workspace and status in ('pending','confirmed');
  if not found then raise exception 'appointment not found' using errcode = 'P0002'; end if;
  if p_ends <= p_starts then raise exception 'invalid time range' using errcode = '22023'; end if;
  if exists (select 1 from public.appointments where workspace_id = p_workspace and employee_user_id = v_emp and id <> p_id and status in ('pending','confirmed') and starts_at < p_ends and ends_at > p_starts) then
    raise exception 'employee already booked in that slot' using errcode = 'P0409';
  end if;
  update public.appointments set starts_at = p_starts, ends_at = p_ends, updated_at = now() where id = p_id;
  perform private.append_audit(p_workspace, v_uid, 'appointment.rescheduled', 'appointment', p_id::text, null, jsonb_build_object('starts_at', p_starts));
end $$;

create function public.disconnect_calendar(p_workspace uuid) returns void language sql security invoker set search_path = '' as $$ select private.disconnect_calendar(p_workspace); $$;
create function public.book_appointment(p_workspace uuid, p_contact uuid, p_employee uuid, p_purpose text, p_starts timestamptz, p_ends timestamptz, p_tz text) returns uuid language sql security invoker set search_path = '' as $$ select private.book_appointment(p_workspace, p_contact, p_employee, p_purpose, p_starts, p_ends, p_tz); $$;
create function public.finish_appointment(p_workspace uuid, p_id uuid, p_status text, p_event_id text, p_error text) returns void language sql security invoker set search_path = '' as $$ select private.finish_appointment(p_workspace, p_id, p_status, p_event_id, p_error); $$;
create function public.reschedule_appointment(p_workspace uuid, p_id uuid, p_starts timestamptz, p_ends timestamptz) returns void language sql security invoker set search_path = '' as $$ select private.reschedule_appointment(p_workspace, p_id, p_starts, p_ends); $$;
revoke all on function public.disconnect_calendar(uuid), public.book_appointment(uuid,uuid,uuid,text,timestamptz,timestamptz,text), public.finish_appointment(uuid,uuid,text,text,text), public.reschedule_appointment(uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.disconnect_calendar(uuid), public.book_appointment(uuid,uuid,uuid,text,timestamptz,timestamptz,text), public.finish_appointment(uuid,uuid,text,text,text), public.reschedule_appointment(uuid,uuid,timestamptz,timestamptz) to authenticated;

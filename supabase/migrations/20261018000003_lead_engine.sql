-- S07/S10 lead engine: capture, round-robin assignment, acknowledgement, durable escalation,
-- absence reassignment, recovery queue and the notification outbox.
--
-- Invariants (docs/10): every lead has exactly one owner (owner_user_id NOT NULL, same-workspace
-- membership FK); all deadlines are persisted (deadline_at) and acted on by pg_cron SQL with
-- FOR UPDATE SKIP LOCKED plus version checks; no provider call ever happens inside these functions.
--
-- Extra SQLSTATE: P0429 rate limited -> 429.

-- ---------------------------------------------------------------- tables
create table public.assignment_rules (
  workspace_id       uuid primary key references public.workspaces (id) on delete cascade,
  max_open_leads     int  not null default 8 check (max_open_leads between 1 and 500),
  -- acknowledgement window per level; levels past the end reuse the last entry
  windows_seconds    int[] not null default '{30,20,15,15}'
                     check (array_length(windows_seconds, 1) between 1 and 8 and 1 <= all (windows_seconds) and 86400 >= all (windows_seconds)),
  alternate_levels   int  not null default 1 check (alternate_levels between 0 and 5),
  backup_user_id     uuid,
  manager_user_id    uuid,
  idle_seconds       int  not null default 900 check (idle_seconds >= 10),
  rotation_cursor    uuid,
  reassign_on_absence boolean not null default true,
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  foreign key (workspace_id, backup_user_id)  references public.memberships (workspace_id, user_id),
  foreign key (workspace_id, manager_user_id) references public.memberships (workspace_id, user_id)
);

create table public.leads (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  contact_id          uuid not null,
  source              text not null check (source in ('web_form', 'whatsapp', 'manual')),
  source_ref          text,
  summary             text not null default '' check (char_length(summary) <= 500),
  owner_user_id       uuid not null,
  status              text not null default 'open' check (status in ('open', 'closed')),
  current_level       int  not null default 0,
  escalation_count    int  not null default 0,
  emergency           boolean not null default false,
  assigned_at         timestamptz not null,
  first_assigned_at   timestamptz not null,
  first_acknowledged_at timestamptz,
  acknowledged_at     timestamptz,           -- acknowledgement of the CURRENT assignment
  acknowledged_by     uuid,
  deadline_at         timestamptz,           -- set while the current assignment awaits acknowledgement
  last_action_at      timestamptz not null,
  version             int  not null default 1,
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id),
  foreign key (workspace_id, owner_user_id) references public.memberships (workspace_id, user_id)
);
create unique index leads_source_ref_unique on public.leads (workspace_id, source, source_ref) where source_ref is not null;
create index leads_due_idx on public.leads (deadline_at) where status = 'open' and acknowledged_at is null;
create index leads_owner_idx on public.leads (workspace_id, owner_user_id, status);
create index leads_ws_created_idx on public.leads (workspace_id, created_at desc, id);

create table public.lead_assignment_events (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null,
  lead_id          uuid not null,
  from_user_id     uuid,
  to_user_id       uuid not null,
  cause            text not null check (cause in ('capture', 'timeout', 'manual', 'absence')),
  level            int  not null,
  due_at           timestamptz,
  previous_version int  not null,
  created_at       timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id),
  unique (lead_id, previous_version, cause)   -- one transition per version: replays cannot double-apply
);
create index lead_events_lead_idx on public.lead_assignment_events (workspace_id, lead_id, created_at);

create table public.outbox_events (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id),
  kind             text not null,
  payload          jsonb not null default '{}',  -- ids and reasons only, never secrets or message bodies
  idempotency_key  text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'leased', 'sent', 'failed', 'dead')),
  attempts         int  not null default 0,
  lease_until      timestamptz,
  next_attempt_at  timestamptz not null default now(),
  provider_reference text,
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index outbox_due_idx on public.outbox_events (next_attempt_at) where status in ('pending', 'failed');

create table public.job_heartbeats (
  job          text primary key,
  last_run_at  timestamptz not null,
  last_result  jsonb not null default '{}'
);

create table private.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int  not null default 1,
  primary key (key, window_start)
);
revoke all on private.rate_limits from public, anon, authenticated;

-- ---------------------------------------------------------------- defaults for workspaces
insert into public.assignment_rules (workspace_id)
  select id from public.workspaces on conflict do nothing;

create or replace function private.create_workspace_for_authenticated_user(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws  uuid;
  v_role uuid;
  v_name text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'invalid workspace name' using errcode = '22023';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'invalid workspace slug' using errcode = '22023';
  end if;

  insert into public.workspaces (slug, name, owner_user_id) values (p_slug, btrim(p_name), v_uid)
  returning id into v_ws;

  insert into public.permission_roles (workspace_id, name, is_preset) values (v_ws, 'Admin', true) returning id into v_role;
  insert into public.role_grants (workspace_id, role_id, permission)
    select v_ws, v_role, key from public.permissions;
  foreach v_name in array array['Manager', 'User'] loop
    insert into public.permission_roles (workspace_id, name, is_preset) values (v_ws, v_name, true) returning id into v_role;
    insert into public.role_grants (workspace_id, role_id, permission)
      select v_ws, v_role, unnest(private.preset_permissions(v_name));
  end loop;

  insert into public.memberships (workspace_id, user_id, base_role) values (v_ws, v_uid, 'owner');
  insert into public.assignment_rules (workspace_id, updated_by) values (v_ws, v_uid);
  perform private.seed_default_pipeline(v_ws, v_uid);
  perform private.append_audit(v_ws, v_uid, 'workspace.created', 'workspace', v_ws::text, null,
    jsonb_build_object('name', btrim(p_name), 'slug', p_slug));
  return v_ws;
end $$;

-- ---------------------------------------------------------------- routing helpers
create function private.window_for(p_rules public.assignment_rules, p_level int) returns int
language sql immutable set search_path = '' as $$
  select p_rules.windows_seconds[least(p_level + 1, array_length(p_rules.windows_seconds, 1))];
$$;

-- Next available employee under the open-lead cap, after the rotation cursor. Caller holds the
-- assignment_rules row lock, which serialises routing for the workspace.
create function private.pick_owner(p_workspace uuid, p_exclude uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_rules public.assignment_rules;
  v_pick uuid;
begin
  select * into v_rules from public.assignment_rules where workspace_id = p_workspace;
  select e.user_id into v_pick from (
    select m.user_id from public.memberships m
    where m.workspace_id = p_workspace and m.enabled and m.availability = 'available'
      and (p_exclude is null or m.user_id <> all (p_exclude))
      and (select count(*) from public.leads l
           where l.workspace_id = p_workspace and l.owner_user_id = m.user_id and l.status = 'open') < v_rules.max_open_leads
  ) e
  where v_rules.rotation_cursor is null or e.user_id > v_rules.rotation_cursor
  order by e.user_id limit 1;
  if v_pick is null then -- wrap around
    select m.user_id into v_pick from public.memberships m
    where m.workspace_id = p_workspace and m.enabled and m.availability = 'available'
      and (p_exclude is null or m.user_id <> all (p_exclude))
      and (select count(*) from public.leads l
           where l.workspace_id = p_workspace and l.owner_user_id = m.user_id and l.status = 'open') < v_rules.max_open_leads
    order by m.user_id limit 1;
  end if;
  if v_pick is not null then
    update public.assignment_rules set rotation_cursor = v_pick where workspace_id = p_workspace;
  end if;
  return v_pick;
end $$;

create function private.emergency_owner(p_workspace uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.memberships where workspace_id = p_workspace and base_role = 'owner' and enabled limit 1;
$$;

-- ---------------------------------------------------------------- capture (F3.1, F3.3, F3.8)
create function private.capture_lead_core(
  p_workspace uuid, p_contact uuid, p_source text, p_source_ref text, p_summary text, p_actor uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_rules public.assignment_rules;
  v_owner uuid;
  v_emergency boolean := false;
  v_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  -- serialise routing for this workspace
  select * into v_rules from public.assignment_rules where workspace_id = p_workspace for update;
  if not found then raise exception 'workspace not found' using errcode = 'P0002'; end if;

  if p_source_ref is not null then
    select id into v_id from public.leads where workspace_id = p_workspace and source = p_source and source_ref = p_source_ref;
    if found then return v_id; end if; -- duplicate delivery: never a second lead, never a re-assignment
  end if;

  v_owner := private.pick_owner(p_workspace, null);
  if v_owner is null then
    v_owner := private.emergency_owner(p_workspace);
    v_emergency := true;
  end if;
  if v_owner is null then raise exception 'workspace has no active owner' using errcode = 'P0002'; end if;

  insert into public.leads (workspace_id, contact_id, source, source_ref, summary, owner_user_id, emergency,
                            assigned_at, first_assigned_at, deadline_at, last_action_at)
  values (p_workspace, p_contact, p_source, p_source_ref, coalesce(p_summary, ''), v_owner, v_emergency,
          v_now, v_now, v_now + make_interval(secs => private.window_for(v_rules, 0)), v_now)
  returning id into v_id;

  insert into public.lead_assignment_events (workspace_id, lead_id, from_user_id, to_user_id, cause, level, due_at, previous_version)
  values (p_workspace, v_id, null, v_owner, 'capture', 0, v_now + make_interval(secs => private.window_for(v_rules, 0)), 0);
  perform private.log_activity(p_workspace, p_contact, null, 'assignment', p_actor,
    case when v_emergency then 'Lead assigned to the workspace owner: no available employee' else 'Lead assigned' end,
    jsonb_build_object('lead_id', v_id, 'to', v_owner, 'source', p_source));
  perform private.append_audit(p_workspace, p_actor, 'lead.captured', 'lead', v_id::text, null,
    jsonb_build_object('source', p_source, 'owner', v_owner, 'emergency', v_emergency));
  if v_emergency then
    insert into public.outbox_events (workspace_id, kind, payload, idempotency_key)
    values (p_workspace, 'lead.escalated', jsonb_build_object('lead_id', v_id, 'to_user_id', v_owner, 'reason', 'NO_ELIGIBLE_EMPLOYEE'),
            'lead.escalated:' || v_id || ':1');
  end if;
  return v_id;
end $$;

create function private.capture_manual_lead(p_workspace uuid, p_contact uuid, p_summary text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'lead.create');
begin
  perform 1 from public.contacts where id = p_contact and workspace_id = p_workspace and archived_at is null;
  if not found then raise exception 'contact not found' using errcode = 'P0002'; end if;
  return private.capture_lead_core(p_workspace, p_contact, 'manual', null, left(btrim(coalesce(p_summary, '')), 500), v_uid);
end $$;

-- Rate limiting that lives in the database, so direct API calls are throttled too.
create function private.hit_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into private.rate_limits (key, window_start) values (p_key, v_window)
    on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
    returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- Public web form: fixed purpose, validates its own input, throttled per client and per workspace.
create function private.submit_public_lead(
  p_slug text, p_name text, p_email text, p_phone text, p_summary text, p_dedupe_key text, p_client_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_contact uuid;
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 160 then raise exception 'invalid name' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'invalid phone' using errcode = '22023'; end if;
  if v_email is null and v_phone is null then raise exception 'email or phone required' using errcode = '22023'; end if;
  if p_dedupe_key is not null and char_length(p_dedupe_key) > 100 then raise exception 'invalid key' using errcode = '22023'; end if;

  select id into v_ws from public.workspaces where slug = p_slug;
  if not found then raise exception 'workspace not found' using errcode = 'P0002'; end if;
  if not private.hit_rate_limit('pub:' || v_ws || ':' || coalesce(p_client_hash, ''), 5, 60)
     or not private.hit_rate_limit('pubws:' || v_ws, 60, 60) then
    raise exception 'too many requests' using errcode = 'P0429';
  end if;

  if v_phone is not null then
    select id into v_contact from public.contacts where workspace_id = v_ws and phone_e164 = v_phone and archived_at is null;
  end if;
  if v_contact is null and v_email is not null then
    select id into v_contact from public.contacts where workspace_id = v_ws and lower(email) = v_email and archived_at is null limit 1;
  end if;
  if v_contact is null then
    insert into public.contacts (workspace_id, name, email, phone_e164) values (v_ws, btrim(p_name), v_email, v_phone) returning id into v_contact;
  end if;
  return private.capture_lead_core(v_ws, v_contact, 'web_form', nullif(p_dedupe_key, ''), left(btrim(coalesce(p_summary, '')), 500), null);
end $$;

-- ---------------------------------------------------------------- acknowledgement (F3.4, F3.8)
create function private.acknowledge_lead(p_workspace uuid, p_lead uuid, p_expected_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'lead.view');
  v_lead public.leads;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_lead from public.leads where id = p_lead and workspace_id = p_workspace for update;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if v_lead.owner_user_id <> v_uid and not private.has_workspace_permission(p_workspace, 'lead.reassign') then
    -- someone else owns it now (e.g. it escalated first): the stale owner must not take it back
    raise exception 'lead is owned by someone else' using errcode = 'P0409';
  end if;
  if v_lead.acknowledged_at is not null then return v_lead.version; end if; -- idempotent
  if v_lead.version <> p_expected_version then raise exception 'stale version' using errcode = 'P0409'; end if;
  if v_lead.status <> 'open' then raise exception 'lead is closed' using errcode = 'P0409'; end if;

  update public.leads
     set acknowledged_at = v_now, acknowledged_by = v_uid, first_acknowledged_at = coalesce(first_acknowledged_at, v_now),
         deadline_at = null, emergency = false, last_action_at = v_now, version = version + 1
   where id = p_lead;
  perform private.log_activity(p_workspace, v_lead.contact_id, null, 'assignment', v_uid, 'Lead acknowledged', jsonb_build_object('lead_id', p_lead));
  perform private.append_audit(p_workspace, v_uid, 'lead.acknowledged', 'lead', p_lead::text, null, jsonb_build_object('owner', v_lead.owner_user_id));
  return v_lead.version + 1;
end $$;

-- A recorded action (note, stage change, ...) by the owner counts as acknowledgement and as activity.
create function private.acknowledge_via_action(p_workspace uuid, p_contact uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; v_now timestamptz := clock_timestamp();
begin
  for r in select id from public.leads
           where workspace_id = p_workspace and contact_id = p_contact and owner_user_id = p_actor and status = 'open' for update loop
    update public.leads
       set acknowledged_at = coalesce(acknowledged_at, v_now),
           acknowledged_by = case when acknowledged_at is null then p_actor else acknowledged_by end,
           first_acknowledged_at = coalesce(first_acknowledged_at, v_now),
           deadline_at = null, emergency = false, last_action_at = v_now, version = version + 1
     where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------- reassignment and closing
create function private.reassign_lead(p_workspace uuid, p_lead uuid, p_new_owner uuid, p_reason text, p_expected_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'lead.reassign');
  v_lead public.leads;
  v_rules public.assignment_rules;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_rules from public.assignment_rules where workspace_id = p_workspace for update;
  select * into v_lead from public.leads where id = p_lead and workspace_id = p_workspace for update;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if v_lead.version <> p_expected_version then raise exception 'stale version' using errcode = 'P0409'; end if;
  if v_lead.status <> 'open' then raise exception 'lead is closed' using errcode = 'P0409'; end if;
  perform 1 from public.memberships where workspace_id = p_workspace and user_id = p_new_owner and enabled;
  if not found then raise exception 'new owner must be an active member' using errcode = '22023'; end if;
  if p_new_owner = v_lead.owner_user_id then return v_lead.version; end if;

  update public.leads
     set owner_user_id = p_new_owner, assigned_at = v_now, acknowledged_at = null, acknowledged_by = null,
         deadline_at = v_now + make_interval(secs => private.window_for(v_rules, 0)), current_level = 0,
         emergency = false, last_action_at = v_now, version = version + 1
   where id = p_lead;
  insert into public.lead_assignment_events (workspace_id, lead_id, from_user_id, to_user_id, cause, level, due_at, previous_version)
  values (p_workspace, p_lead, v_lead.owner_user_id, p_new_owner, 'manual', 0, v_now + make_interval(secs => private.window_for(v_rules, 0)), v_lead.version);
  perform private.log_activity(p_workspace, v_lead.contact_id, null, 'assignment', v_uid, 'Lead reassigned manually',
    jsonb_build_object('lead_id', p_lead, 'from', v_lead.owner_user_id, 'to', p_new_owner, 'reason', left(coalesce(p_reason, ''), 200)));
  perform private.append_audit(p_workspace, v_uid, 'lead.reassigned', 'lead', p_lead::text,
    jsonb_build_object('owner', v_lead.owner_user_id), jsonb_build_object('owner', p_new_owner, 'reason', left(coalesce(p_reason, ''), 200)));
  return v_lead.version + 1;
end $$;

create function private.close_lead(p_workspace uuid, p_lead uuid, p_expected_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'lead.view'); v_lead public.leads;
begin
  select * into v_lead from public.leads where id = p_lead and workspace_id = p_workspace for update;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if v_lead.owner_user_id <> v_uid and not private.has_workspace_permission(p_workspace, 'lead.reassign') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_lead.version <> p_expected_version then raise exception 'stale version' using errcode = 'P0409'; end if;
  if v_lead.status = 'closed' then return v_lead.version; end if;
  update public.leads set status = 'closed', closed_at = now(), deadline_at = null, emergency = false, version = version + 1 where id = p_lead;
  perform private.append_audit(p_workspace, v_uid, 'lead.closed', 'lead', p_lead::text, null, null);
  return v_lead.version + 1;
end $$;

-- ---------------------------------------------------------------- escalation (F3.5, F3.8)
-- One call processes up to p_limit due leads. Lock order is always: workspace routing row first, then
-- its leads (same as capture/reassign), so engines can never deadlock. A workspace whose routing row is
-- busy is skipped this tick; overlapping runs claim disjoint leads (SKIP LOCKED) and every transition is
-- additionally guarded by the lead's version and a unique (lead, previous_version, cause) event row.
create function private.escalate_due_leads(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w record;
  r record;
  v_lead public.leads;
  v_rules public.assignment_rules;
  v_now timestamptz;
  v_next int;
  v_to uuid;
  v_emergency boolean;
  v_done int := 0;
  v_skipped int := 0;
  v_alt int;
begin
  for w in select distinct workspace_id from public.leads
           where status = 'open' and acknowledged_at is null and deadline_at <= now() loop
    exit when v_done >= p_limit;
    select * into v_rules from public.assignment_rules where workspace_id = w.workspace_id for update skip locked;
    if not found then v_skipped := v_skipped + 1; continue; end if;

    for r in
      select id from public.leads
      where workspace_id = w.workspace_id and status = 'open' and acknowledged_at is null and deadline_at <= now()
      order by deadline_at
      for update skip locked
      limit greatest(p_limit - v_done, 0)
    loop
      select * into v_lead from public.leads where id = r.id;
      if v_lead.status <> 'open' or v_lead.acknowledged_at is not null or v_lead.deadline_at > now() then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_now := clock_timestamp();
      v_alt := v_rules.alternate_levels;
      v_next := v_lead.current_level + 1;
      v_to := null;
      v_emergency := false;

      while v_to is null loop
        if v_next <= v_alt then
          v_to := private.pick_owner(w.workspace_id, array(select to_user_id from public.lead_assignment_events where lead_id = v_lead.id));
        elsif v_next = v_alt + 1 then
          select m.user_id into v_to from public.memberships m
           where m.workspace_id = w.workspace_id and m.user_id = v_rules.backup_user_id and m.enabled
             and m.availability in ('available', 'busy') and m.user_id <> v_lead.owner_user_id;
        elsif v_next = v_alt + 2 then
          select m.user_id into v_to from public.memberships m
           where m.workspace_id = w.workspace_id and m.user_id = v_rules.manager_user_id and m.enabled
             and m.availability in ('available', 'busy') and m.user_id <> v_lead.owner_user_id;
        else
          v_to := private.emergency_owner(w.workspace_id);
          v_emergency := true;
          v_next := v_alt + 3;
          exit;
        end if;
        if v_to is null then v_next := v_next + 1; end if;
      end loop;
      if v_to is null then v_skipped := v_skipped + 1; continue; end if; -- workspace without an active owner

      update public.leads
         set owner_user_id = v_to, current_level = v_next, escalation_count = escalation_count + 1, emergency = v_emergency,
             assigned_at = v_now, deadline_at = v_now + make_interval(secs => private.window_for(v_rules, v_next)),
             acknowledged_at = null, acknowledged_by = null, version = version + 1
       where id = v_lead.id and version = v_lead.version;
      if not found then v_skipped := v_skipped + 1; continue; end if;

      insert into public.lead_assignment_events (workspace_id, lead_id, from_user_id, to_user_id, cause, level, due_at, previous_version)
      values (w.workspace_id, v_lead.id, v_lead.owner_user_id, v_to, 'timeout', v_next,
              v_now + make_interval(secs => private.window_for(v_rules, v_next)), v_lead.version)
      on conflict (lead_id, previous_version, cause) do nothing;

      perform private.log_activity(w.workspace_id, v_lead.contact_id, null, 'assignment', null,
        case when v_to = v_lead.owner_user_id then 'Acknowledgement window expired again; owner reminded' else 'Escalated after the acknowledgement window expired' end,
        jsonb_build_object('lead_id', v_lead.id, 'from', v_lead.owner_user_id, 'to', v_to, 'level', v_next));
      perform private.append_audit(w.workspace_id, null, 'lead.escalated', 'lead', v_lead.id::text,
        jsonb_build_object('owner', v_lead.owner_user_id, 'level', v_lead.current_level),
        jsonb_build_object('owner', v_to, 'level', v_next, 'emergency', v_emergency));
      if v_to <> v_lead.owner_user_id then
        insert into public.outbox_events (workspace_id, kind, payload, idempotency_key)
        values (w.workspace_id, 'lead.escalated',
                jsonb_build_object('lead_id', v_lead.id, 'to_user_id', v_to, 'level', v_next,
                                   'reason', case when v_emergency then 'NO_ELIGIBLE_EMPLOYEE' else 'ACK_WINDOW_EXPIRED' end),
                'lead.escalated:' || v_lead.id || ':' || (v_lead.version + 1))
        on conflict (idempotency_key) do nothing;
      end if;
      v_done := v_done + 1;
    end loop;
  end loop;

  insert into public.job_heartbeats (job, last_run_at, last_result)
  values ('escalate_due_leads', now(), jsonb_build_object('escalated', v_done, 'skipped', v_skipped))
  on conflict (job) do update set last_run_at = excluded.last_run_at, last_result = excluded.last_result;
  return jsonb_build_object('escalated', v_done, 'skipped', v_skipped);
end $$;

-- ---------------------------------------------------------------- absence (F3.6)
-- Unacknowledged leads move immediately; acknowledged ones stay with their owner (policy shown in the UI).
create function private.reassign_unacknowledged_leads(p_workspace uuid, p_user uuid, p_actor uuid, p_include_acknowledged boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_rules public.assignment_rules;
  v_to uuid;
  v_emergency boolean;
  v_now timestamptz := clock_timestamp();
  v_count int := 0;
begin
  select * into v_rules from public.assignment_rules where workspace_id = p_workspace for update;
  if not v_rules.reassign_on_absence then return 0; end if;
  for r in select * from public.leads
           where workspace_id = p_workspace and owner_user_id = p_user and status = 'open'
             and (p_include_acknowledged or acknowledged_at is null)
           order by created_at for update loop
    v_to := private.pick_owner(p_workspace, array[p_user]);
    v_emergency := false;
    if v_to is null then
      v_to := private.emergency_owner(p_workspace);
      v_emergency := true;
    end if;
    continue when v_to is null or v_to = p_user;

    update public.leads
       set owner_user_id = v_to, assigned_at = v_now, current_level = 0, emergency = v_emergency,
           acknowledged_at = null, acknowledged_by = null,
           deadline_at = v_now + make_interval(secs => private.window_for(v_rules, 0)), version = version + 1
     where id = r.id;
    insert into public.lead_assignment_events (workspace_id, lead_id, from_user_id, to_user_id, cause, level, due_at, previous_version)
    values (p_workspace, r.id, p_user, v_to, 'absence', 0, v_now + make_interval(secs => private.window_for(v_rules, 0)), r.version);
    perform private.log_activity(p_workspace, r.contact_id, null, 'assignment', p_actor,
      'Reassigned because the owner became unavailable', jsonb_build_object('lead_id', r.id, 'from', p_user, 'to', v_to));
    perform private.append_audit(p_workspace, p_actor, 'lead.reassigned_absence', 'lead', r.id::text,
      jsonb_build_object('owner', p_user), jsonb_build_object('owner', v_to, 'emergency', v_emergency));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function private.set_member_availability(p_workspace uuid, p_target uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_old text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_status not in ('available', 'busy', 'on_leave', 'offline') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_target <> v_uid and not private.has_workspace_permission(p_workspace, 'assignment.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target = v_uid and not private.is_workspace_member(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select availability into v_old from public.memberships
   where workspace_id = p_workspace and user_id = p_target and enabled for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  update public.memberships set availability = p_status where workspace_id = p_workspace and user_id = p_target;
  perform private.append_audit(p_workspace, v_uid, 'member.availability_changed', 'membership', p_target::text,
    jsonb_build_object('availability', v_old), jsonb_build_object('availability', p_status));
  if p_status in ('on_leave', 'offline') then
    perform private.reassign_unacknowledged_leads(p_workspace, p_target, v_uid);
  end if;
end $$;

create or replace function private.change_member_access(
  p_workspace uuid, p_target uuid, p_base_role text, p_role uuid, p_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_caller text;
  v_old    public.memberships;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not private.has_workspace_permission(p_workspace, 'role.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select base_role into v_caller from public.memberships where workspace_id = p_workspace and user_id = v_uid;

  select * into v_old from public.memberships where workspace_id = p_workspace and user_id = p_target for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  if v_old.base_role = 'owner' then raise exception 'the Owner cannot be modified' using errcode = '42501'; end if;
  if p_base_role not in ('admin', 'user') then raise exception 'invalid role' using errcode = '22023'; end if;
  if p_target = v_uid and (p_enabled is false or p_base_role <> v_old.base_role) then
    raise exception 'cannot change your own access' using errcode = '42501';
  end if;
  if (p_base_role = 'admin' or v_old.base_role = 'admin') and p_base_role <> v_old.base_role and v_caller <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.memberships
     set base_role = p_base_role, permission_role_id = p_role, enabled = p_enabled
   where workspace_id = p_workspace and user_id = p_target;
  perform private.append_audit(p_workspace, v_uid, 'member.access_changed', 'membership', p_target::text,
    jsonb_build_object('base_role', v_old.base_role, 'permission_role_id', v_old.permission_role_id, 'enabled', v_old.enabled),
    jsonb_build_object('base_role', p_base_role, 'permission_role_id', p_role, 'enabled', p_enabled));
  if v_old.enabled and not p_enabled then
    -- a disabled member must not keep owning leads
    update public.memberships set availability = 'offline' where workspace_id = p_workspace and user_id = p_target;
    perform private.reassign_unacknowledged_leads(p_workspace, p_target, v_uid, true);
  end if;
end $$;

-- ---------------------------------------------------------------- recorded actions acknowledge leads
create or replace function private.add_note(p_workspace uuid, p_contact uuid, p_opportunity uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'crm.edit');
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'invalid note' using errcode = '22023'; end if;
  perform 1 from public.contacts where id = p_contact and workspace_id = p_workspace;
  if not found then raise exception 'contact not found' using errcode = 'P0002'; end if;
  perform private.log_activity(p_workspace, p_contact, p_opportunity, 'note', v_uid, btrim(p_body), '{}');
  perform private.acknowledge_via_action(p_workspace, p_contact, v_uid);
end $$;

create or replace function private.move_opportunity_stage(p_workspace uuid, p_opportunity uuid, p_stage uuid, p_expected_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'crm.edit');
  v_opp public.opportunities;
  v_missing jsonb;
begin
  select * into v_opp from public.opportunities where id = p_opportunity and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  if v_opp.version <> p_expected_version then raise exception 'stale version' using errcode = 'P0409'; end if;
  perform 1 from public.stages where id = p_stage and workspace_id = p_workspace and pipeline_id = v_opp.pipeline_id and archived_at is null;
  if not found then raise exception 'stage not found in this pipeline' using errcode = 'P0002'; end if;
  if v_opp.stage_id = p_stage then return v_opp.version; end if;

  v_missing := private.missing_required_fields(p_workspace, p_stage, v_opp.custom_values);
  if jsonb_array_length(v_missing) > 0 then
    raise exception 'required stage fields missing' using errcode = 'P0422', detail = jsonb_build_object('fields', v_missing)::text;
  end if;

  update public.opportunities set stage_id = p_stage, version = version + 1, updated_at = now() where id = p_opportunity;
  perform private.log_activity(p_workspace, v_opp.contact_id, p_opportunity, 'stage_change', v_uid, null,
    jsonb_build_object('from', v_opp.stage_id, 'to', p_stage));
  perform private.append_audit(p_workspace, v_uid, 'opportunity.stage_changed', 'opportunity', p_opportunity::text,
    jsonb_build_object('stage_id', v_opp.stage_id), jsonb_build_object('stage_id', p_stage));
  perform private.acknowledge_via_action(p_workspace, v_opp.contact_id, v_uid);
  return v_opp.version + 1;
end $$;

-- ---------------------------------------------------------------- rules editor (F3.3)
create function private.update_assignment_rules(
  p_workspace uuid, p_max_open int, p_windows int[], p_alternates int, p_backup uuid, p_manager uuid, p_idle int, p_reassign_on_absence boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'assignment.manage'); v_old public.assignment_rules;
begin
  select * into v_old from public.assignment_rules where workspace_id = p_workspace for update;
  update public.assignment_rules
     set max_open_leads = p_max_open, windows_seconds = p_windows, alternate_levels = p_alternates, backup_user_id = p_backup,
         manager_user_id = p_manager, idle_seconds = p_idle, reassign_on_absence = p_reassign_on_absence,
         updated_at = now(), updated_by = v_uid
   where workspace_id = p_workspace; -- check constraints and composite FKs validate the values
  perform private.append_audit(p_workspace, v_uid, 'assignment.rules_changed', 'assignment_rules', p_workspace::text,
    jsonb_build_object('max_open', v_old.max_open_leads, 'windows', v_old.windows_seconds, 'alternates', v_old.alternate_levels,
                       'backup', v_old.backup_user_id, 'manager', v_old.manager_user_id, 'idle', v_old.idle_seconds),
    jsonb_build_object('max_open', p_max_open, 'windows', p_windows, 'alternates', p_alternates,
                       'backup', p_backup, 'manager', p_manager, 'idle', p_idle));
end $$;

-- ---------------------------------------------------------------- recovery queue and team (F3.7, F5)
create function private.lead_reasons(l public.leads, p_idle int) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when l.status = 'open' and l.acknowledged_at is null and l.deadline_at <= now() then 'PAST_DUE_UNACKNOWLEDGED' end,
    case when l.status = 'open' and l.acknowledged_at is null and l.escalation_count >= 2 then 'ESCALATED_TWICE' end,
    case when l.status = 'open' and l.last_action_at < now() - make_interval(secs => p_idle) then 'IDLE_TOO_LONG' end,
    case when l.status = 'open' and l.emergency then 'NO_ELIGIBLE_EMPLOYEE' end,
    case when l.status = 'open' and exists (
           select 1 from public.outbox_events o
           where o.workspace_id = l.workspace_id and o.payload ->> 'lead_id' = l.id::text and o.status in ('failed', 'dead')
         ) then 'FAILED_EXTERNAL_ALERT' end
  ], null);
$$;

create function private.recovery_queue(p_workspace uuid) returns table (
  lead_id uuid, contact_id uuid, contact_name text, summary text, source text, owner_user_id uuid, owner_name text,
  deadline_at timestamptz, assigned_at timestamptz, escalation_count int, current_level int, reasons text[], version int
) language plpgsql stable security definer set search_path = '' as $$
declare v_all boolean; v_uid uuid; v_idle int;
begin
  v_uid := private.require_permission(p_workspace, 'lead.view');
  v_all := private.has_workspace_permission(p_workspace, 'lead.reassign');
  select idle_seconds into v_idle from public.assignment_rules where workspace_id = p_workspace;
  return query
    select l.id, l.contact_id, c.name, l.summary, l.source, l.owner_user_id, p.display_name,
           l.deadline_at, l.assigned_at, l.escalation_count, l.current_level, private.lead_reasons(l, v_idle), l.version
    from public.leads l
    join public.contacts c on c.id = l.contact_id and c.workspace_id = l.workspace_id
    left join public.profiles p on p.id = l.owner_user_id
    where l.workspace_id = p_workspace and l.status = 'open'
      and (v_all or l.owner_user_id = v_uid)
      and cardinality(private.lead_reasons(l, v_idle)) > 0
    order by (l.acknowledged_at is null and l.deadline_at <= now()) desc, l.deadline_at nulls last, l.created_at;
end $$;

create function private.team_overview(p_workspace uuid) returns table (
  user_id uuid, display_name text, base_role text, availability text, open_leads bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not found' using errcode = 'P0002'; end if;
  return query
    select m.user_id, p.display_name, m.base_role, m.availability,
           (select count(*) from public.leads l where l.workspace_id = m.workspace_id and l.owner_user_id = m.user_id and l.status = 'open')
    from public.memberships m left join public.profiles p on p.id = m.user_id
    where m.workspace_id = p_workspace and m.enabled
    order by p.display_name;
end $$;

-- ---------------------------------------------------------------- outbox dispatch (service role only)
create function private.claim_outbox(p_limit int, p_lease_seconds int) returns setof public.outbox_events
language plpgsql security definer set search_path = '' as $$
begin
  return query
    update public.outbox_events o
       set status = 'leased', lease_until = now() + make_interval(secs => p_lease_seconds), attempts = attempts + 1
     where o.id in (
       select id from public.outbox_events
       where (status in ('pending', 'failed') and next_attempt_at <= now()) or (status = 'leased' and lease_until < now())
       order by next_attempt_at limit p_limit for update skip locked
     )
    returning o.*;
end $$;

create function private.finish_outbox(p_id uuid, p_ok boolean, p_reference text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_attempts int;
begin
  select attempts into v_attempts from public.outbox_events where id = p_id for update;
  if p_ok then
    update public.outbox_events set status = 'sent', sent_at = now(), provider_reference = p_reference, last_error = null, lease_until = null where id = p_id;
  elsif v_attempts >= 4 then
    update public.outbox_events set status = 'dead', last_error = left(p_error, 500), lease_until = null where id = p_id;
  else
    -- bounded exponential backoff: 5s, 20s, 80s
    update public.outbox_events set status = 'failed', last_error = left(p_error, 500), lease_until = null,
           next_attempt_at = now() + make_interval(secs => 5 * power(4, v_attempts - 1)::int) where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------- schedules (Supabase Cron)
select cron.schedule('escalate-due-leads', '5 seconds', $$select private.escalate_due_leads(50)$$);
select cron.schedule('prune-rate-limits', '*/10 * * * *', $$delete from private.rate_limits where window_start < now() - interval '1 hour'$$);

-- ---------------------------------------------------------------- grants and wrappers
grant execute on function
  private.capture_manual_lead(uuid, uuid, text),
  private.acknowledge_lead(uuid, uuid, int),
  private.reassign_lead(uuid, uuid, uuid, text, int),
  private.close_lead(uuid, uuid, int),
  private.update_assignment_rules(uuid, int, int[], int, uuid, uuid, int, boolean),
  private.recovery_queue(uuid),
  private.team_overview(uuid)
to authenticated;
grant usage on schema private to anon;
grant execute on function private.submit_public_lead(text, text, text, text, text, text, text) to anon, authenticated;

create function public.capture_manual_lead(p_workspace uuid, p_contact uuid, p_summary text) returns uuid language sql security invoker set search_path = '' as $$ select private.capture_manual_lead(p_workspace, p_contact, p_summary); $$;
create function public.acknowledge_lead(p_workspace uuid, p_lead uuid, p_expected_version int) returns int language sql security invoker set search_path = '' as $$ select private.acknowledge_lead(p_workspace, p_lead, p_expected_version); $$;
create function public.reassign_lead(p_workspace uuid, p_lead uuid, p_new_owner uuid, p_reason text, p_expected_version int) returns int language sql security invoker set search_path = '' as $$ select private.reassign_lead(p_workspace, p_lead, p_new_owner, p_reason, p_expected_version); $$;
create function public.close_lead(p_workspace uuid, p_lead uuid, p_expected_version int) returns int language sql security invoker set search_path = '' as $$ select private.close_lead(p_workspace, p_lead, p_expected_version); $$;
create function public.update_assignment_rules(p_workspace uuid, p_max_open int, p_windows int[], p_alternates int, p_backup uuid, p_manager uuid, p_idle int, p_reassign_on_absence boolean) returns void language sql security invoker set search_path = '' as $$ select private.update_assignment_rules(p_workspace, p_max_open, p_windows, p_alternates, p_backup, p_manager, p_idle, p_reassign_on_absence); $$;
create function public.recovery_queue(p_workspace uuid) returns table (lead_id uuid, contact_id uuid, contact_name text, summary text, source text, owner_user_id uuid, owner_name text, deadline_at timestamptz, assigned_at timestamptz, escalation_count int, current_level int, reasons text[], version int) language sql security invoker set search_path = '' as $$ select * from private.recovery_queue(p_workspace); $$;
create function public.team_overview(p_workspace uuid) returns table (user_id uuid, display_name text, base_role text, availability text, open_leads bigint) language sql security invoker set search_path = '' as $$ select * from private.team_overview(p_workspace); $$;
create function public.submit_public_lead(p_slug text, p_name text, p_email text, p_phone text, p_summary text, p_dedupe_key text, p_client_hash text) returns uuid language sql security invoker set search_path = '' as $$ select private.submit_public_lead(p_slug, p_name, p_email, p_phone, p_summary, p_dedupe_key, p_client_hash); $$;
create function public.claim_outbox(p_limit int, p_lease_seconds int) returns setof public.outbox_events language sql security invoker set search_path = '' as $$ select * from private.claim_outbox(p_limit, p_lease_seconds); $$;
create function public.finish_outbox(p_id uuid, p_ok boolean, p_reference text, p_error text) returns void language sql security invoker set search_path = '' as $$ select private.finish_outbox(p_id, p_ok, p_reference, p_error); $$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('capture_manual_lead','acknowledge_lead','reassign_lead','close_lead',
             'update_assignment_rules','recovery_queue','team_overview','submit_public_lead','claim_outbox','finish_outbox') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.capture_manual_lead(uuid, uuid, text), public.acknowledge_lead(uuid, uuid, int),
    public.reassign_lead(uuid, uuid, uuid, text, int), public.close_lead(uuid, uuid, int),
    public.update_assignment_rules(uuid, int, int[], int, uuid, uuid, int, boolean),
    public.recovery_queue(uuid), public.team_overview(uuid) to authenticated;
  grant execute on function public.submit_public_lead(text, text, text, text, text, text, text) to anon, authenticated;
  -- outbox dispatch is for the server-side dispatcher only
  grant execute on function public.claim_outbox(int, int), public.finish_outbox(uuid, boolean, text, text) to service_role;
  grant execute on function private.claim_outbox(int, int), private.finish_outbox(uuid, boolean, text, text) to service_role;
  grant usage on schema private to service_role;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.assignment_rules        enable row level security;
alter table public.leads                   enable row level security;
alter table public.lead_assignment_events  enable row level security;
alter table public.outbox_events           enable row level security;
alter table public.job_heartbeats          enable row level security;

revoke all on public.assignment_rules, public.leads, public.lead_assignment_events, public.outbox_events, public.job_heartbeats
from anon, authenticated;

grant select on public.assignment_rules to authenticated;
create policy assignment_rules_select on public.assignment_rules for select to authenticated using ((select private.is_workspace_member(workspace_id)));

-- managers see every lead; everyone else with lead.view sees the ones they own
grant select on public.leads to authenticated;
create policy leads_select on public.leads for select to authenticated using (
  (select private.has_workspace_permission(workspace_id, 'lead.reassign'))
  or ((select private.has_workspace_permission(workspace_id, 'lead.view')) and owner_user_id = (select auth.uid()))
);
grant select on public.lead_assignment_events to authenticated;
create policy lead_events_select on public.lead_assignment_events for select to authenticated using (
  (select private.has_workspace_permission(workspace_id, 'lead.reassign'))
  or ((select private.has_workspace_permission(workspace_id, 'lead.view')) and exists (
        select 1 from public.leads l
        where l.id = lead_assignment_events.lead_id and l.workspace_id = lead_assignment_events.workspace_id
          and l.owner_user_id = (select auth.uid())))
);

-- delivery failures are visible to people who manage integrations
grant select (id, workspace_id, kind, status, attempts, last_error, next_attempt_at, created_at, sent_at) on public.outbox_events to authenticated;
create policy outbox_select on public.outbox_events for select to authenticated using ((select private.has_workspace_permission(workspace_id, 'integrations.manage')));
grant select on public.job_heartbeats to authenticated;
create policy heartbeats_select on public.job_heartbeats for select to authenticated using (true);

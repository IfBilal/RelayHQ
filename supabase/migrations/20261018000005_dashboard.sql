-- S16 dashboard: one SQL definition of every figure (docs/13), scoped by role, plus per-user widget visibility.
-- Company-wide scope needs lead.reassign; everyone else sees figures for leads they own or acknowledged.

create table public.dashboard_preferences (
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  hidden_widgets text[] not null default '{}' check (cardinality(hidden_widgets) <= 20),
  updated_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.dashboard_preferences enable row level security;
revoke all on public.dashboard_preferences from anon, authenticated;
grant select, insert, update on public.dashboard_preferences to authenticated;
create policy dashboard_prefs_select on public.dashboard_preferences for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy dashboard_prefs_insert on public.dashboard_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));
create policy dashboard_prefs_update on public.dashboard_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.is_workspace_member(workspace_id)));

create function private.dashboard_overview(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'dashboard.view');
  v_all boolean := private.has_workspace_permission(p_workspace, 'lead.reassign');
  v_tz text;
  v_idle int;
  v_cap int;
  v_w0 int;
  v_today timestamptz;
  v_series jsonb;
  v_new int; v_open int; v_avg numeric; v_esc int; v_recovery int; v_avail int; v_team int;
begin
  select timezone into v_tz from public.workspaces where id = p_workspace;
  select idle_seconds, max_open_leads, windows_seconds[1] into v_idle, v_cap, v_w0 from public.assignment_rules where workspace_id = p_workspace;
  v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;

  select count(*) into v_new from public.leads l
   where l.workspace_id = p_workspace and l.created_at >= v_today and (v_all or l.owner_user_id = v_uid or l.acknowledged_by = v_uid);
  select count(*) into v_open from public.leads l
   where l.workspace_id = p_workspace and l.status = 'open' and (v_all or l.owner_user_id = v_uid);
  -- average of (first acknowledgement - first assignment) over the last 7 local days; an average, not a median
  select avg(extract(epoch from (l.first_acknowledged_at - l.first_assigned_at))) into v_avg from public.leads l
   where l.workspace_id = p_workspace and l.first_acknowledged_at is not null and l.created_at >= v_today - interval '6 days'
     and (v_all or l.owner_user_id = v_uid or l.acknowledged_by = v_uid);
  -- automatic escalations only; manual reassignments are not counted
  select count(*) into v_esc from public.lead_assignment_events e
   where e.workspace_id = p_workspace and e.cause = 'timeout' and e.created_at >= now() - interval '24 hours'
     and (v_all or e.to_user_id = v_uid);
  select count(*) into v_recovery from public.leads l
   where l.workspace_id = p_workspace and l.status = 'open' and (v_all or l.owner_user_id = v_uid)
     and cardinality(private.lead_reasons(l, v_idle)) > 0;
  select count(*) filter (where m.availability = 'available' and
           (select count(*) from public.leads l where l.workspace_id = m.workspace_id and l.owner_user_id = m.user_id and l.status = 'open') < v_cap),
         count(*)
    into v_avail, v_team from public.memberships m where m.workspace_id = p_workspace and m.enabled;

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'total', s.total, 'withinSla', s.within) order by d.day), '[]') into v_series
  from (select (v_today + make_interval(days => g))::date as day, v_today + make_interval(days => g) as start
        from generate_series(-6, 0) g) d
  cross join lateral (
    select count(*) as total,
           count(*) filter (where l.first_acknowledged_at is not null
                            and l.first_acknowledged_at - l.first_assigned_at <= make_interval(secs => v_w0)) as within
    from public.leads l
    where l.workspace_id = p_workspace and l.created_at >= d.start and l.created_at < d.start + interval '1 day'
      and (v_all or l.owner_user_id = v_uid or l.acknowledged_by = v_uid)
  ) s;

  return jsonb_build_object(
    'serverNow', now(), 'timezone', v_tz, 'scope', case when v_all then 'company' else 'self' end,
    'newLeadsToday', v_new, 'openLeads', v_open, 'averageFirstResponseSeconds', v_avg,
    'escalations24h', v_esc, 'recoveryCount', v_recovery, 'availableStaff', v_avail, 'teamSize', v_team,
    'firstWindowSeconds', v_w0, 'responseSeries', v_series
  );
end $$;

grant execute on function private.dashboard_overview(uuid) to authenticated;
create function public.dashboard_overview(p_workspace uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.dashboard_overview(p_workspace); $$;
revoke execute on function public.dashboard_overview(uuid) from public, anon;
grant execute on function public.dashboard_overview(uuid) to authenticated;

-- Review fixes for stage management (PR: CRM configuration UI).
--  * delete_stage: archiving to a fixed negative slot collided on the second delete at the same position
--    (unique (pipeline_id, position) also covers archived rows). Archived stages now take the next free negative slot.
--  * delete_stage: structural guards (never the last open stage, never the last Won/Lost stage) and moves
--    archived opportunities too, so none keeps pointing at a dead stage.
--  * reorder_stages: terminal (Won/Lost) stages must stay last.
--  * create_opportunity: the stage must be active and belong to the pipeline (also closes the race with delete_stage).

create or replace function private.delete_stage(p_workspace uuid, p_stage uuid, p_move_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage');
  v_stage public.stages;
  v_count int;
  v_blocked int;
begin
  perform 1 from public.pipelines where id = (select pipeline_id from public.stages where id = p_stage and workspace_id = p_workspace)
    and workspace_id = p_workspace for update; -- same lock order as add_stage / reorder_stages
  select * into v_stage from public.stages where id = p_stage and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'stage not found' using errcode = 'P0002'; end if;

  if v_stage.terminal_type is null then
    if not exists (select 1 from public.stages where pipeline_id = v_stage.pipeline_id and archived_at is null and terminal_type is null and id <> p_stage) then
      raise exception 'a pipeline needs at least one open stage' using errcode = 'P0409', detail = jsonb_build_object('reason', 'last_open_stage')::text;
    end if;
  elsif not exists (select 1 from public.stages where pipeline_id = v_stage.pipeline_id and archived_at is null and terminal_type = v_stage.terminal_type and id <> p_stage) then
    raise exception 'a pipeline needs a % stage', v_stage.terminal_type using errcode = 'P0409', detail = jsonb_build_object('reason', 'last_terminal_stage')::text;
  end if;

  select count(*) into v_count from public.opportunities where stage_id = p_stage and archived_at is null;
  if v_count > 0 then
    if p_move_to is null or p_move_to = p_stage then
      raise exception 'stage has opportunities' using errcode = 'P0409', detail = jsonb_build_object('opportunities', v_count)::text;
    end if;
    perform 1 from public.stages where id = p_move_to and workspace_id = p_workspace and pipeline_id = v_stage.pipeline_id and archived_at is null;
    if not found then raise exception 'destination must be another stage of the same pipeline' using errcode = '22023'; end if;
    select count(*) into v_blocked from public.opportunities o
     where o.stage_id = p_stage and o.archived_at is null
       and jsonb_array_length(private.missing_required_fields(p_workspace, p_move_to, o.custom_values)) > 0;
    if v_blocked > 0 then
      raise exception 'destination requires fields the opportunities lack' using errcode = 'P0409', detail = jsonb_build_object('blocked', v_blocked)::text;
    end if;
  end if;
  -- every opportunity (archived included) leaves the dead stage
  if p_move_to is not null and p_move_to <> p_stage then
    update public.opportunities set stage_id = p_move_to, version = version + 1, updated_at = now() where stage_id = p_stage;
  end if;

  update public.stages
     set archived_at = now(),
         position = (select least(min(position), 0) - 1 from public.stages where pipeline_id = v_stage.pipeline_id) -- next free negative slot
   where id = p_stage;
  perform private.append_audit(p_workspace, v_uid, 'stage.deleted', 'stage', p_stage::text,
    jsonb_build_object('name', v_stage.name), jsonb_build_object('moved_to', p_move_to, 'moved', v_count));
end $$;

create or replace function private.reorder_stages(p_workspace uuid, p_pipeline uuid, p_order uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_count int; v_open int;
begin
  perform 1 from public.pipelines where id = p_pipeline and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'pipeline not found' using errcode = 'P0002'; end if;
  select count(*), count(*) filter (where terminal_type is null) into v_count, v_open
    from public.stages where pipeline_id = p_pipeline and archived_at is null;
  if coalesce(array_length(p_order, 1), 0) <> v_count
     or exists (select 1 from unnest(p_order) s where s not in (select id from public.stages where pipeline_id = p_pipeline and archived_at is null))
     or (select count(distinct s) from unnest(p_order) s) <> v_count then
    raise exception 'order must list every active stage exactly once' using errcode = '22023';
  end if;
  -- Won/Lost stay at the end
  if exists (select 1 from unnest(p_order) with ordinality t(id, ord) join public.stages s on s.id = t.id
             where s.terminal_type is not null and t.ord <= v_open) then
    raise exception 'closed stages must stay last' using errcode = '22023';
  end if;
  set constraints public.stages_pipeline_id_position_key deferred;
  update public.stages s set position = o.ord from (select id, ord from unnest(p_order) with ordinality t(id, ord)) o where s.id = o.id;
  perform private.append_audit(p_workspace, v_uid, 'stage.reordered', 'pipeline', p_pipeline::text, null, jsonb_build_object('order', p_order));
end $$;

create or replace function private.create_opportunity(
  p_workspace uuid, p_contact uuid, p_pipeline uuid, p_stage uuid, p_title text, p_currency text,
  p_value_minor bigint, p_owner uuid, p_custom jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'crm.create');
  v_id uuid;
  v_custom jsonb := coalesce(p_custom, '{}');
begin
  if p_value_minor is not null and not private.has_workspace_permission(p_workspace, 'opportunity.value.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- the stage must be active and belong to the pipeline; FOR SHARE blocks a concurrent delete_stage
  perform 1 from public.stages s join public.pipelines p on p.id = s.pipeline_id
   where s.id = p_stage and s.workspace_id = p_workspace and s.pipeline_id = p_pipeline and s.archived_at is null and p.archived_at is null
     for share of s;
  if not found then raise exception 'stage not available' using errcode = '22023'; end if;
  perform private.validate_custom_values(p_workspace, p_pipeline, v_custom);
  if jsonb_array_length(private.missing_required_fields(p_workspace, p_stage, v_custom)) > 0 then
    raise exception 'required stage fields missing' using errcode = 'P0422',
      detail = jsonb_build_object('fields', private.missing_required_fields(p_workspace, p_stage, v_custom))::text;
  end if;

  insert into public.opportunities (workspace_id, contact_id, pipeline_id, stage_id, title, currency, owner_user_id, custom_values)
  values (p_workspace, p_contact, p_pipeline, p_stage, btrim(p_title), coalesce(p_currency, 'USD'), coalesce(p_owner, v_uid), v_custom)
  returning id into v_id; -- cross-tenant contact ids fail the composite FK
  if p_value_minor is not null then
    insert into private.opportunity_financials (opportunity_id, workspace_id, value_minor) values (v_id, p_workspace, p_value_minor);
  end if;
  perform private.log_activity(p_workspace, p_contact, v_id, 'system', v_uid, 'Opportunity created', jsonb_build_object('title', btrim(p_title)));
  perform private.append_audit(p_workspace, v_uid, 'opportunity.created', 'opportunity', v_id::text, null, jsonb_build_object('title', btrim(p_title), 'stage_id', p_stage));
  return v_id;
end $$;

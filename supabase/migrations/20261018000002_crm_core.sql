-- S06/S08 CRM core: companies, contacts, pipelines, stages, custom fields, opportunities,
-- saved views and the activity timeline.
--
-- Money: opportunity values live in private.opportunity_financials, which no API role can read.
-- They are only reachable through permission-checked functions, so lists, details, exports and
-- aggregates cannot leak them to a user without `opportunity.value.view` (F1.4).
--
-- Extra SQLSTATEs used by these functions (mapped in src/contracts/errors.ts):
--   P0409 stale version / blocked change -> 409     P0422 required stage fields missing -> 422

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- tables
create table public.companies (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 160),
  version      int  not null default 1,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  company_id    uuid,
  name          text not null check (char_length(btrim(name)) between 1 and 160),
  email         text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone_e164    text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  owner_user_id uuid,
  opted_out     boolean not null default false,
  version       int  not null default 1,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.companies (workspace_id, id),
  foreign key (workspace_id, owner_user_id) references public.memberships (workspace_id, user_id)
);
create unique index contacts_phone_unique on public.contacts (workspace_id, phone_e164)
  where phone_e164 is not null and archived_at is null;
create index contacts_ws_created_idx on public.contacts (workspace_id, created_at desc, id);
create index contacts_name_trgm_idx on public.contacts using gin (name extensions.gin_trgm_ops);

create table public.pipelines (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  is_default   boolean not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index pipelines_one_default on public.pipelines (workspace_id) where is_default and archived_at is null;

create table public.stages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  pipeline_id   uuid not null,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  position      int  not null,
  terminal_type text check (terminal_type in ('won', 'lost')),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, pipeline_id, id),
  foreign key (workspace_id, pipeline_id) references public.pipelines (workspace_id, id) on delete cascade,
  unique (pipeline_id, position) deferrable initially immediate
);

create table public.field_definitions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  pipeline_id  uuid,
  entity_type  text not null check (entity_type in ('opportunity')),
  key          text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label        text not null check (char_length(btrim(label)) between 1 and 80),
  type         text not null check (type in ('text', 'number', 'date', 'dropdown', 'checkbox')),
  options      jsonb not null default '[]',
  help_text    text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, pipeline_id) references public.pipelines (workspace_id, id) on delete cascade,
  check (type <> 'dropdown' or jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 1 and 50)
);
create unique index field_definitions_key_unique on public.field_definitions
  (workspace_id, coalesce(pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_type, key);

create table public.stage_required_fields (
  workspace_id        uuid not null,
  stage_id            uuid not null,
  field_definition_id uuid not null,
  primary key (stage_id, field_definition_id),
  foreign key (workspace_id, stage_id) references public.stages (workspace_id, id) on delete cascade,
  foreign key (workspace_id, field_definition_id) references public.field_definitions (workspace_id, id) on delete cascade
);

create table public.opportunities (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  contact_id    uuid not null,
  pipeline_id   uuid not null,
  stage_id      uuid not null,
  title         text not null check (char_length(btrim(title)) between 1 and 160),
  currency      text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  owner_user_id uuid,
  custom_values jsonb not null default '{}' check (jsonb_typeof(custom_values) = 'object'),
  version       int  not null default 1,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id),
  foreign key (workspace_id, pipeline_id, stage_id) references public.stages (workspace_id, pipeline_id, id),
  foreign key (workspace_id, owner_user_id) references public.memberships (workspace_id, user_id)
);
create index opportunities_stage_idx on public.opportunities (workspace_id, stage_id) where archived_at is null;
create index opportunities_contact_idx on public.opportunities (workspace_id, contact_id);

create table private.opportunity_financials (
  opportunity_id uuid primary key,
  workspace_id   uuid not null,
  value_minor    bigint not null check (value_minor >= 0),
  foreign key (workspace_id, opportunity_id) references public.opportunities (workspace_id, id) on delete cascade
);
revoke all on private.opportunity_financials from public, anon, authenticated;

create table public.saved_views (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id),
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  entity_type   text not null check (entity_type in ('contact', 'opportunity', 'lead')),
  filter_ast    jsonb not null check (jsonb_typeof(filter_ast) = 'object' and pg_column_size(filter_ast) < 8192),
  columns       jsonb not null default '[]',
  created_at    timestamptz not null default now()
);

create table public.activity_events (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null,
  contact_id     uuid,
  opportunity_id uuid,
  kind           text not null check (kind in ('note', 'stage_change', 'field_edit', 'assignment', 'message', 'payment', 'appointment', 'system')),
  actor_user_id  uuid,
  body           text check (body is null or char_length(body) <= 4000),
  data           jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id),
  foreign key (workspace_id, opportunity_id) references public.opportunities (workspace_id, id)
);
create index activity_contact_idx on public.activity_events (workspace_id, contact_id, created_at desc);
create index activity_opportunity_idx on public.activity_events (workspace_id, opportunity_id, created_at desc);

-- ---------------------------------------------------------------- shared triggers
create function private.touch_row() returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger companies_touch before update on public.companies for each row execute function private.touch_row();
create trigger contacts_touch before update on public.contacts for each row execute function private.touch_row();

-- archiving needs crm.delete, not just crm.edit
create function private.guard_archive() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is distinct from old.archived_at and not private.has_workspace_permission(new.workspace_id, 'crm.delete') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger companies_guard_archive before update on public.companies for each row execute function private.guard_archive();
create trigger contacts_guard_archive before update on public.contacts for each row execute function private.guard_archive();

-- ---------------------------------------------------------------- guard helpers
-- Non-members get "not found" (no tenant probing); members without the permission get "forbidden".
create function private.require_permission(p_workspace uuid, p_permission text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not private.is_workspace_member(p_workspace) then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.has_workspace_permission(p_workspace, p_permission) then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_uid;
end $$;

-- Checks a custom_values object against the pipeline's active field definitions.
create function private.validate_custom_values(p_workspace uuid, p_pipeline uuid, p_values jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  k text;
  v jsonb;
  d public.field_definitions;
  v_ok boolean;
begin
  for k, v in select * from jsonb_each(p_values) loop
    select * into d from public.field_definitions
     where workspace_id = p_workspace and entity_type = 'opportunity' and key = k and archived_at is null
       and (pipeline_id = p_pipeline or pipeline_id is null)
     order by pipeline_id nulls last limit 1;
    if not found then raise exception 'unknown field %', k using errcode = '22023'; end if;
    if jsonb_typeof(v) = 'null' then continue; end if;
    -- computed first: PL/pgSQL ends an IF condition at the first THEN, which CASE arms contain
    v_ok := case d.type
        when 'text'     then jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 2000
        when 'number'   then jsonb_typeof(v) = 'number'
        when 'checkbox' then jsonb_typeof(v) = 'boolean'
        when 'date'     then jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
        when 'dropdown' then jsonb_typeof(v) = 'string' and d.options ? (v #>> '{}')
      end;
    if v_ok is not true then
      raise exception 'invalid value for %', k using errcode = '22023';
    end if;
    if d.type = 'date' then perform ((v #>> '{}')::date); end if; -- rejects 2026-02-31
  end loop;
end $$;

-- Lists required fields of a stage that the given values do not satisfy.
create function private.missing_required_fields(p_workspace uuid, p_stage uuid, p_values jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.key, 'label', f.label) order by f.label), '[]')
  from public.stage_required_fields r
  join public.field_definitions f on f.id = r.field_definition_id and f.workspace_id = r.workspace_id and f.archived_at is null
  where r.workspace_id = p_workspace and r.stage_id = p_stage
    and (
      p_values -> f.key is null
      or jsonb_typeof(p_values -> f.key) = 'null'
      or (f.type in ('text', 'dropdown') and btrim(p_values ->> f.key) = '')
    );
$$;

create function private.log_activity(
  p_workspace uuid, p_contact uuid, p_opportunity uuid, p_kind text, p_actor uuid, p_body text, p_data jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.activity_events (workspace_id, contact_id, opportunity_id, kind, actor_user_id, body, data)
  values (p_workspace, p_contact, p_opportunity, p_kind, p_actor, p_body, coalesce(p_data, '{}'));
$$;

-- ---------------------------------------------------------------- pipeline configuration (F2.3, F2.5)
create function private.seed_default_pipeline(p_workspace uuid, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pipeline uuid;
begin
  insert into public.pipelines (workspace_id, name, is_default) values (p_workspace, 'Sales pipeline', true) returning id into v_pipeline;
  insert into public.stages (workspace_id, pipeline_id, name, position, terminal_type) values
    (p_workspace, v_pipeline, 'New inquiry', 1, null),
    (p_workspace, v_pipeline, 'Qualified', 2, null),
    (p_workspace, v_pipeline, 'Proposal sent', 3, null),
    (p_workspace, v_pipeline, 'Negotiation', 4, null),
    (p_workspace, v_pipeline, 'Won', 5, 'won'),
    (p_workspace, v_pipeline, 'Lost', 6, 'lost');
  perform private.append_audit(p_workspace, p_actor, 'pipeline.created', 'pipeline', v_pipeline::text, null,
    jsonb_build_object('name', 'Sales pipeline', 'default', true));
  return v_pipeline;
end $$;

-- Signup now also creates the default pipeline.
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
  perform private.seed_default_pipeline(v_ws, v_uid);
  perform private.append_audit(v_ws, v_uid, 'workspace.created', 'workspace', v_ws::text, null,
    jsonb_build_object('name', btrim(p_name), 'slug', p_slug));
  return v_ws;
end $$;

-- Backfill workspaces created before this migration.
do $$
declare w record;
begin
  for w in select id, owner_user_id from public.workspaces ws
           where not exists (select 1 from public.pipelines p where p.workspace_id = ws.id) loop
    perform private.seed_default_pipeline(w.id, w.owner_user_id);
  end loop;
end $$;

create function private.create_pipeline(p_workspace uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_id uuid;
begin
  insert into public.pipelines (workspace_id, name) values (p_workspace, btrim(p_name)) returning id into v_id;
  insert into public.stages (workspace_id, pipeline_id, name, position, terminal_type) values
    (p_workspace, v_id, 'New', 1, null), (p_workspace, v_id, 'Won', 2, 'won'), (p_workspace, v_id, 'Lost', 3, 'lost');
  perform private.append_audit(p_workspace, v_uid, 'pipeline.created', 'pipeline', v_id::text, null, jsonb_build_object('name', btrim(p_name)));
  return v_id;
end $$;

create function private.add_stage(p_workspace uuid, p_pipeline uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_id uuid; v_pos int;
begin
  perform 1 from public.pipelines where id = p_pipeline and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'pipeline not found' using errcode = 'P0002'; end if;
  -- new open stages go before the first terminal stage
  select coalesce(min(position), (select coalesce(max(position), 0) + 1 from public.stages where pipeline_id = p_pipeline and archived_at is null))
    into v_pos from public.stages where pipeline_id = p_pipeline and archived_at is null and terminal_type is not null;
  set constraints public.stages_pipeline_id_position_key deferred;
  update public.stages set position = position + 1 where pipeline_id = p_pipeline and archived_at is null and position >= v_pos;
  insert into public.stages (workspace_id, pipeline_id, name, position) values (p_workspace, p_pipeline, btrim(p_name), v_pos) returning id into v_id;
  perform private.append_audit(p_workspace, v_uid, 'stage.created', 'stage', v_id::text, null, jsonb_build_object('name', btrim(p_name), 'pipeline_id', p_pipeline));
  return v_id;
end $$;

create function private.rename_stage(p_workspace uuid, p_stage uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_old text;
begin
  select name into v_old from public.stages where id = p_stage and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'stage not found' using errcode = 'P0002'; end if;
  update public.stages set name = btrim(p_name) where id = p_stage;
  perform private.append_audit(p_workspace, v_uid, 'stage.renamed', 'stage', p_stage::text, jsonb_build_object('name', v_old), jsonb_build_object('name', btrim(p_name)));
end $$;

create function private.reorder_stages(p_workspace uuid, p_pipeline uuid, p_order uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_count int;
begin
  perform 1 from public.pipelines where id = p_pipeline and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'pipeline not found' using errcode = 'P0002'; end if;
  select count(*) into v_count from public.stages where pipeline_id = p_pipeline and archived_at is null;
  if coalesce(array_length(p_order, 1), 0) <> v_count
     or exists (select 1 from unnest(p_order) s where s not in (select id from public.stages where pipeline_id = p_pipeline and archived_at is null))
     or (select count(distinct s) from unnest(p_order) s) <> v_count then
    raise exception 'order must list every active stage exactly once' using errcode = '22023';
  end if;
  set constraints public.stages_pipeline_id_position_key deferred;
  update public.stages s set position = o.ord from (select id, ord from unnest(p_order) with ordinality t(id, ord)) o where s.id = o.id;
  perform private.append_audit(p_workspace, v_uid, 'stage.reordered', 'pipeline', p_pipeline::text, null, jsonb_build_object('order', p_order));
end $$;

-- Deleting a populated stage requires a destination stage in the same pipeline whose required fields
-- every moved opportunity already satisfies; otherwise nothing changes and the blockers are reported.
create function private.delete_stage(p_workspace uuid, p_stage uuid, p_move_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage');
  v_stage public.stages;
  v_count int;
  v_blocked int;
begin
  select * into v_stage from public.stages where id = p_stage and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'stage not found' using errcode = 'P0002'; end if;
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
    update public.opportunities set stage_id = p_move_to, version = version + 1, updated_at = now()
     where stage_id = p_stage and archived_at is null;
  end if;

  update public.stages set archived_at = now(), position = -position - 1000000 where id = p_stage; -- frees the slot
  perform private.append_audit(p_workspace, v_uid, 'stage.deleted', 'stage', p_stage::text,
    jsonb_build_object('name', v_stage.name), jsonb_build_object('moved_to', p_move_to, 'moved', v_count));
end $$;

create function private.create_field_definition(
  p_workspace uuid, p_pipeline uuid, p_key text, p_label text, p_type text, p_options jsonb, p_help text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_id uuid;
begin
  insert into public.field_definitions (workspace_id, pipeline_id, entity_type, key, label, type, options, help_text)
  values (p_workspace, p_pipeline, 'opportunity', p_key, btrim(p_label), p_type, coalesce(p_options, '[]'), p_help)
  returning id into v_id; -- bad pipeline id fails the composite FK, duplicate key raises 23505
  perform private.append_audit(p_workspace, v_uid, 'field.created', 'field_definition', v_id::text, null,
    jsonb_build_object('key', p_key, 'type', p_type, 'pipeline_id', p_pipeline));
  return v_id;
end $$;

create function private.archive_field_definition(p_workspace uuid, p_field uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_key text;
begin
  update public.field_definitions set archived_at = now() where id = p_field and workspace_id = p_workspace and archived_at is null returning key into v_key;
  if not found then raise exception 'field not found' using errcode = 'P0002'; end if;
  delete from public.stage_required_fields where field_definition_id = p_field; -- values stay on records for history
  perform private.append_audit(p_workspace, v_uid, 'field.archived', 'field_definition', p_field::text, jsonb_build_object('key', v_key), null);
end $$;

create function private.set_stage_required_fields(p_workspace uuid, p_stage uuid, p_fields uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'pipeline.manage'); v_pipeline uuid;
begin
  select pipeline_id into v_pipeline from public.stages where id = p_stage and workspace_id = p_workspace and archived_at is null;
  if not found then raise exception 'stage not found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from unnest(p_fields) f
    where f not in (select id from public.field_definitions
                    where workspace_id = p_workspace and archived_at is null and (pipeline_id = v_pipeline or pipeline_id is null))
  ) then raise exception 'field does not belong to this pipeline' using errcode = '22023'; end if;
  delete from public.stage_required_fields where stage_id = p_stage;
  insert into public.stage_required_fields (workspace_id, stage_id, field_definition_id)
    select p_workspace, p_stage, f from (select distinct unnest(p_fields) f) s;
  perform private.append_audit(p_workspace, v_uid, 'stage.required_fields_changed', 'stage', p_stage::text, null, jsonb_build_object('fields', p_fields));
end $$;

-- ---------------------------------------------------------------- opportunities (F2.1, F2.4, F1.4)
create function private.create_opportunity(
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
  perform private.validate_custom_values(p_workspace, p_pipeline, v_custom);
  if jsonb_array_length(private.missing_required_fields(p_workspace, p_stage, v_custom)) > 0 then
    raise exception 'required stage fields missing' using errcode = 'P0422',
      detail = jsonb_build_object('fields', private.missing_required_fields(p_workspace, p_stage, v_custom))::text;
  end if;

  insert into public.opportunities (workspace_id, contact_id, pipeline_id, stage_id, title, currency, owner_user_id, custom_values)
  values (p_workspace, p_contact, p_pipeline, p_stage, btrim(p_title), coalesce(p_currency, 'USD'), coalesce(p_owner, v_uid), v_custom)
  returning id into v_id; -- cross-tenant contact/stage ids fail the composite FKs
  if p_value_minor is not null then
    insert into private.opportunity_financials (opportunity_id, workspace_id, value_minor) values (v_id, p_workspace, p_value_minor);
  end if;
  perform private.log_activity(p_workspace, p_contact, v_id, 'system', v_uid, 'Opportunity created', jsonb_build_object('title', btrim(p_title)));
  perform private.append_audit(p_workspace, v_uid, 'opportunity.created', 'opportunity', v_id::text, null, jsonb_build_object('title', btrim(p_title), 'stage_id', p_stage));
  return v_id;
end $$;

create function private.move_opportunity_stage(p_workspace uuid, p_opportunity uuid, p_stage uuid, p_expected_version int) returns int
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
  return v_opp.version + 1;
end $$;

create function private.set_opportunity_custom_values(p_workspace uuid, p_opportunity uuid, p_values jsonb, p_expected_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_permission(p_workspace, 'crm.edit');
  v_opp public.opportunities;
  v_new jsonb;
begin
  select * into v_opp from public.opportunities where id = p_opportunity and workspace_id = p_workspace and archived_at is null for update;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  if v_opp.version <> p_expected_version then raise exception 'stale version' using errcode = 'P0409'; end if;
  perform private.validate_custom_values(p_workspace, v_opp.pipeline_id, p_values);
  v_new := v_opp.custom_values || p_values;
  update public.opportunities set custom_values = v_new, version = version + 1, updated_at = now() where id = p_opportunity;
  perform private.log_activity(p_workspace, v_opp.contact_id, p_opportunity, 'field_edit', v_uid, null,
    jsonb_build_object('before', v_opp.custom_values, 'after', v_new));
  return v_opp.version + 1;
end $$;

create function private.set_opportunity_value(p_workspace uuid, p_opportunity uuid, p_value_minor bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'opportunity.value.view'); v_old bigint; v_contact uuid;
begin
  select contact_id into v_contact from public.opportunities where id = p_opportunity and workspace_id = p_workspace and archived_at is null;
  if not found then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  select value_minor into v_old from private.opportunity_financials where opportunity_id = p_opportunity;
  insert into private.opportunity_financials (opportunity_id, workspace_id, value_minor) values (p_opportunity, p_workspace, p_value_minor)
    on conflict (opportunity_id) do update set value_minor = excluded.value_minor;
  perform private.log_activity(p_workspace, v_contact, p_opportunity, 'field_edit', v_uid, 'Value changed', '{}');
  perform private.append_audit(p_workspace, v_uid, 'opportunity.value_changed', 'opportunity', p_opportunity::text,
    jsonb_build_object('value_minor', v_old), jsonb_build_object('value_minor', p_value_minor));
end $$;

-- The only read path for money.
create function private.opportunity_values(p_workspace uuid, p_ids uuid[]) returns table (opportunity_id uuid, value_minor bigint, currency text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission(p_workspace, 'opportunity.value.view');
  return query
    select f.opportunity_id, f.value_minor, o.currency
    from private.opportunity_financials f
    join public.opportunities o on o.id = f.opportunity_id and o.workspace_id = f.workspace_id
    where f.workspace_id = p_workspace and f.opportunity_id = any (p_ids);
end $$;

create function private.pipeline_value_by_stage(p_workspace uuid, p_pipeline uuid) returns table (stage_id uuid, open_value_minor bigint, count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission(p_workspace, 'opportunity.value.view');
  return query
    select s.id, coalesce(sum(f.value_minor), 0)::bigint, count(o.id)
    from public.stages s
    left join public.opportunities o on o.stage_id = s.id and o.archived_at is null
    left join private.opportunity_financials f on f.opportunity_id = o.id
    where s.workspace_id = p_workspace and s.pipeline_id = p_pipeline and s.archived_at is null and s.terminal_type is null
    group by s.id, s.position order by s.position;
end $$;

create function private.add_note(p_workspace uuid, p_contact uuid, p_opportunity uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_permission(p_workspace, 'crm.edit');
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'invalid note' using errcode = '22023'; end if;
  perform 1 from public.contacts where id = p_contact and workspace_id = p_workspace;
  if not found then raise exception 'contact not found' using errcode = 'P0002'; end if;
  perform private.log_activity(p_workspace, p_contact, p_opportunity, 'note', v_uid, btrim(p_body), '{}');
end $$;

-- ---------------------------------------------------------------- grants and wrappers
grant execute on function
  private.require_permission(uuid, text),
  private.create_pipeline(uuid, text),
  private.add_stage(uuid, uuid, text),
  private.rename_stage(uuid, uuid, text),
  private.reorder_stages(uuid, uuid, uuid[]),
  private.delete_stage(uuid, uuid, uuid),
  private.create_field_definition(uuid, uuid, text, text, text, jsonb, text),
  private.archive_field_definition(uuid, uuid),
  private.set_stage_required_fields(uuid, uuid, uuid[]),
  private.create_opportunity(uuid, uuid, uuid, uuid, text, text, bigint, uuid, jsonb),
  private.move_opportunity_stage(uuid, uuid, uuid, int),
  private.set_opportunity_custom_values(uuid, uuid, jsonb, int),
  private.set_opportunity_value(uuid, uuid, bigint),
  private.opportunity_values(uuid, uuid[]),
  private.pipeline_value_by_stage(uuid, uuid),
  private.add_note(uuid, uuid, uuid, text)
to authenticated;

create function public.create_pipeline(p_workspace uuid, p_name text) returns uuid language sql security invoker set search_path = '' as $$ select private.create_pipeline(p_workspace, p_name); $$;
create function public.add_stage(p_workspace uuid, p_pipeline uuid, p_name text) returns uuid language sql security invoker set search_path = '' as $$ select private.add_stage(p_workspace, p_pipeline, p_name); $$;
create function public.rename_stage(p_workspace uuid, p_stage uuid, p_name text) returns void language sql security invoker set search_path = '' as $$ select private.rename_stage(p_workspace, p_stage, p_name); $$;
create function public.reorder_stages(p_workspace uuid, p_pipeline uuid, p_order uuid[]) returns void language sql security invoker set search_path = '' as $$ select private.reorder_stages(p_workspace, p_pipeline, p_order); $$;
create function public.delete_stage(p_workspace uuid, p_stage uuid, p_move_to uuid) returns void language sql security invoker set search_path = '' as $$ select private.delete_stage(p_workspace, p_stage, p_move_to); $$;
create function public.create_field_definition(p_workspace uuid, p_pipeline uuid, p_key text, p_label text, p_type text, p_options jsonb, p_help text) returns uuid language sql security invoker set search_path = '' as $$ select private.create_field_definition(p_workspace, p_pipeline, p_key, p_label, p_type, p_options, p_help); $$;
create function public.archive_field_definition(p_workspace uuid, p_field uuid) returns void language sql security invoker set search_path = '' as $$ select private.archive_field_definition(p_workspace, p_field); $$;
create function public.set_stage_required_fields(p_workspace uuid, p_stage uuid, p_fields uuid[]) returns void language sql security invoker set search_path = '' as $$ select private.set_stage_required_fields(p_workspace, p_stage, p_fields); $$;
create function public.create_opportunity(p_workspace uuid, p_contact uuid, p_pipeline uuid, p_stage uuid, p_title text, p_currency text, p_value_minor bigint, p_owner uuid, p_custom jsonb) returns uuid language sql security invoker set search_path = '' as $$ select private.create_opportunity(p_workspace, p_contact, p_pipeline, p_stage, p_title, p_currency, p_value_minor, p_owner, p_custom); $$;
create function public.move_opportunity_stage(p_workspace uuid, p_opportunity uuid, p_stage uuid, p_expected_version int) returns int language sql security invoker set search_path = '' as $$ select private.move_opportunity_stage(p_workspace, p_opportunity, p_stage, p_expected_version); $$;
create function public.set_opportunity_custom_values(p_workspace uuid, p_opportunity uuid, p_values jsonb, p_expected_version int) returns int language sql security invoker set search_path = '' as $$ select private.set_opportunity_custom_values(p_workspace, p_opportunity, p_values, p_expected_version); $$;
create function public.set_opportunity_value(p_workspace uuid, p_opportunity uuid, p_value_minor bigint) returns void language sql security invoker set search_path = '' as $$ select private.set_opportunity_value(p_workspace, p_opportunity, p_value_minor); $$;
create function public.opportunity_values(p_workspace uuid, p_ids uuid[]) returns table (opportunity_id uuid, value_minor bigint, currency text) language sql security invoker set search_path = '' as $$ select * from private.opportunity_values(p_workspace, p_ids); $$;
create function public.pipeline_value_by_stage(p_workspace uuid, p_pipeline uuid) returns table (stage_id uuid, open_value_minor bigint, count bigint) language sql security invoker set search_path = '' as $$ select * from private.pipeline_value_by_stage(p_workspace, p_pipeline); $$;
create function public.add_note(p_workspace uuid, p_contact uuid, p_opportunity uuid, p_body text) returns void language sql security invoker set search_path = '' as $$ select private.add_note(p_workspace, p_contact, p_opportunity, p_body); $$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_pipeline','add_stage','rename_stage','reorder_stages','delete_stage',
             'create_field_definition','archive_field_definition','set_stage_required_fields','create_opportunity',
             'move_opportunity_stage','set_opportunity_custom_values','set_opportunity_value','opportunity_values',
             'pipeline_value_by_stage','add_note') loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.companies            enable row level security;
alter table public.contacts             enable row level security;
alter table public.pipelines            enable row level security;
alter table public.stages               enable row level security;
alter table public.field_definitions    enable row level security;
alter table public.stage_required_fields enable row level security;
alter table public.opportunities        enable row level security;
alter table public.saved_views          enable row level security;
alter table public.activity_events      enable row level security;

revoke all on public.companies, public.contacts, public.pipelines, public.stages, public.field_definitions,
  public.stage_required_fields, public.opportunities, public.saved_views, public.activity_events
from anon, authenticated;

-- companies and contacts: direct CRUD under RLS (workspace_id and version are not client-writable)
grant select on public.companies, public.contacts to authenticated;
grant insert (workspace_id, name) on public.companies to authenticated;
grant update (name, archived_at) on public.companies to authenticated;
grant insert (workspace_id, name, email, phone_e164, company_id, owner_user_id) on public.contacts to authenticated;
grant update (name, email, phone_e164, company_id, owner_user_id, opted_out, archived_at) on public.contacts to authenticated;

create policy companies_select on public.companies for select to authenticated using ((select private.has_workspace_permission(workspace_id, 'crm.view')));
create policy companies_insert on public.companies for insert to authenticated with check ((select private.has_workspace_permission(workspace_id, 'crm.create')));
create policy companies_update on public.companies for update to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'crm.edit'))) with check ((select private.has_workspace_permission(workspace_id, 'crm.edit')));

create policy contacts_select on public.contacts for select to authenticated using ((select private.has_workspace_permission(workspace_id, 'crm.view')));
create policy contacts_insert on public.contacts for insert to authenticated with check ((select private.has_workspace_permission(workspace_id, 'crm.create')));
create policy contacts_update on public.contacts for update to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'crm.edit'))) with check ((select private.has_workspace_permission(workspace_id, 'crm.edit')));

-- configuration and opportunities: read-only through the Data API; writes go through the functions above
grant select on public.pipelines, public.stages, public.field_definitions, public.stage_required_fields, public.opportunities, public.activity_events to authenticated;
create policy pipelines_select on public.pipelines for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy stages_select on public.stages for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy field_definitions_select on public.field_definitions for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy stage_required_fields_select on public.stage_required_fields for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy opportunities_select on public.opportunities for select to authenticated using ((select private.has_workspace_permission(workspace_id, 'crm.view')));
create policy activity_events_select on public.activity_events for select to authenticated using ((select private.has_workspace_permission(workspace_id, 'crm.view')));

-- saved views: each user manages their own
grant select, insert, update, delete on public.saved_views to authenticated;
create policy saved_views_select on public.saved_views for select to authenticated
  using (owner_user_id = (select auth.uid()) and (select private.has_workspace_permission(workspace_id, 'crm.view')));
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and (select private.has_workspace_permission(workspace_id, 'crm.view')));
create policy saved_views_update on public.saved_views for update to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()) and (select private.has_workspace_permission(workspace_id, 'crm.view')));
create policy saved_views_delete on public.saved_views for delete to authenticated using (owner_user_id = (select auth.uid()));

create function private.initialize_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := 1;
  return new;
end;
$$;

create trigger projects_initialize_before_insert
before insert on public.projects
for each row execute function private.initialize_project();

create function private.capture_project_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'The project identity, owner, and creation time are immutable.' using errcode = '22023';
  end if;
  if (new.name, new.description, new.address_space, new.plan, new.archived) is distinct from (old.name, old.description, old.address_space, old.plan, old.archived) then
    insert into public.project_revisions (owner_id, project_id, name, snapshot)
    values (old.owner_id, old.id, 'Before version ' || (old.version + 1)::text, to_jsonb(old) - 'owner_id');
    new.version := old.version + 1;
    new.updated_at := pg_catalog.clock_timestamp();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger projects_revision_before_update
before update on public.projects
for each row execute function private.capture_project_revision();

create function private.validate_saved_network()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_network cidr;
  paired_network cidr;
begin
  if new.parent_id is not null then
    select n.network into parent_network
    from public.saved_networks n
    where n.id = new.parent_id and n.project_id = new.project_id and n.owner_id = new.owner_id
    for share;
    if not found or not (parent_network >> new.network) then
      raise exception 'A parent network must belong to this project and strictly contain the child network.' using errcode = '23514';
    end if;
  end if;
  if new.paired_network_id is not null then
    select n.network into paired_network
    from public.saved_networks n
    where n.id = new.paired_network_id and n.project_id = new.project_id and n.owner_id = new.owner_id
    for share;
    if not found or family(paired_network) = family(new.network) then
      raise exception 'A paired network must belong to this project and use the other IP version.' using errcode = '23514';
    end if;
  end if;
  if exists (
    select 1 from public.saved_networks n
    where n.parent_id = new.id and n.owner_id = new.owner_id and not (new.network >> n.network)
  ) then
    raise exception 'The updated parent must strictly contain its existing child networks.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.saved_networks n
    where n.paired_network_id = new.id and n.owner_id = new.owner_id and family(n.network) = family(new.network)
  ) then
    raise exception 'The updated network must preserve the IP version distinction of existing pairs.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger saved_networks_validate_before_write
before insert or update of network, parent_id, paired_network_id, project_id, owner_id on public.saved_networks
for each row execute function private.validate_saved_network();

create function private.validate_vlsm_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  reserved_value jsonb;
  reserved_network cidr;
begin
  if jsonb_typeof(new.reserved) <> 'array' then
    raise exception 'Reservations must be a JSON array of CIDR strings.' using errcode = '22023';
  end if;
  for reserved_value in select value from jsonb_array_elements(new.reserved)
  loop
    if jsonb_typeof(reserved_value) <> 'string' then
      raise exception 'Each reservation must be a CIDR string.' using errcode = '22023';
    end if;
    begin
      reserved_network := (reserved_value #>> '{}')::cidr;
    exception when invalid_text_representation then
      raise exception 'A reservation is not a canonical CIDR network.' using errcode = '22023';
    end;
    if not (new.parent_network >>= reserved_network) then
      raise exception 'Every reservation must be contained by the VLSM parent.' using errcode = '23514';
    end if;
  end loop;
  if exists (
    select 1 from public.vlsm_segments s
    where s.plan_id = new.id and s.owner_id = new.owner_id
      and ((s.locked_cidr is not null and not (new.parent_network >>= s.locked_cidr))
        or (s.allocated_network is not null and not (new.parent_network >>= s.allocated_network)))
  ) then
    raise exception 'The VLSM parent must contain all existing segment allocations and locks.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger vlsm_plans_validate_before_write
before insert or update of parent_network, reserved on public.vlsm_plans
for each row execute function private.validate_vlsm_plan();

create function private.validate_vlsm_segment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_network cidr;
begin
  select p.parent_network into parent_network
  from public.vlsm_plans p
  where p.id = new.plan_id and p.owner_id = new.owner_id
  for share;
  if not found then
    raise exception 'The VLSM plan must belong to the segment owner.' using errcode = '23503';
  end if;
  if (new.locked_cidr is not null and not (parent_network >>= new.locked_cidr))
    or (new.allocated_network is not null and not (parent_network >>= new.allocated_network)) then
    raise exception 'Segment locks and allocations must fit within the VLSM parent.' using errcode = '23514';
  end if;
  if new.locked_cidr is not null and new.allocated_network is not null and new.locked_cidr <> new.allocated_network then
    raise exception 'An allocated locked segment must retain its locked CIDR.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger vlsm_segments_validate_before_write
before insert or update of plan_id, owner_id, locked_cidr, allocated_network on public.vlsm_segments
for each row execute function private.validate_vlsm_segment();

create function private.prepare_project_share()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  project_row public.projects;
begin
  if tg_op = 'INSERT' then
    select p.* into project_row
    from public.projects p
    where p.id = new.project_id and p.owner_id = new.owner_id
    for share;
    if not found then
      raise exception 'The shared project must belong to the share owner.' using errcode = '23503';
    end if;
    new.snapshot := to_jsonb(project_row) - 'owner_id';
    new.created_at := least(new.created_at, pg_catalog.clock_timestamp());
    if new.revoked_at is not null then
      new.revoked_at := pg_catalog.clock_timestamp();
    end if;
  else
    if (new.id, new.owner_id, new.project_id, new.token_hash, new.snapshot, new.expires_at, new.created_at)
      is distinct from (old.id, old.owner_id, old.project_id, old.token_hash, old.snapshot, old.expires_at, old.created_at) then
      raise exception 'A shared snapshot is immutable. Create a new link to share a new revision.' using errcode = '22023';
    end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'A revoked link cannot be reactivated or revised.' using errcode = '22023';
    end if;
    if old.revoked_at is null and new.revoked_at is not null then
      new.revoked_at := pg_catalog.clock_timestamp();
    end if;
  end if;
  return new;
end;
$$;

create trigger project_shares_guard_before_write
before insert or update on public.project_shares
for each row execute function private.prepare_project_share();

create function private.update_practice_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.practice_stats as stats (
    owner_id, topic, difficulty, attempts, correct_answers, total_duration_ms, best_streak, current_streak, last_practiced_at
  ) values (
    new.owner_id, new.topic, new.difficulty, 1, case when new.correct then 1 else 0 end,
    new.duration_ms, case when new.correct then 1 else 0 end, case when new.correct then 1 else 0 end, new.created_at
  )
  on conflict (owner_id, topic, difficulty) do update set
    attempts = stats.attempts + 1,
    correct_answers = stats.correct_answers + case when new.correct then 1 else 0 end,
    total_duration_ms = stats.total_duration_ms + new.duration_ms,
    current_streak = case when new.correct then stats.current_streak + 1 else 0 end,
    best_streak = greatest(stats.best_streak, case when new.correct then stats.current_streak + 1 else 0 end),
    last_practiced_at = greatest(stats.last_practiced_at, new.created_at);
  return new;
end;
$$;

create trigger quiz_attempts_stats_after_insert
after insert on public.quiz_attempts
for each row execute function private.update_practice_stats();

create function private.touch_conversation_after_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.ai_conversations set updated_at = pg_catalog.clock_timestamp()
  where id = new.conversation_id and owner_id = new.owner_id;
  return new;
end;
$$;

create trigger ai_messages_touch_conversation_after_insert
after insert on public.ai_messages
for each row execute function private.touch_conversation_after_message();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects', 'saved_networks', 'saved_calculations', 'vlsm_plans', 'vlsm_segments',
    'ai_conversations', 'favorites'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)', table_name || '_select_owner', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)', table_name || '_insert_owner', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)', table_name || '_update_owner', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)', table_name || '_delete_owner', table_name);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy profiles_select_owner on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_owner on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_owner on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

alter table public.project_revisions enable row level security;
revoke all on public.project_revisions from anon, authenticated;
grant select, insert on public.project_revisions to authenticated;
grant all on public.project_revisions to service_role;
create policy project_revisions_select_owner on public.project_revisions for select to authenticated using ((select auth.uid()) = owner_id);
create policy project_revisions_insert_owner on public.project_revisions for insert to authenticated with check ((select auth.uid()) = owner_id);

alter table public.project_shares enable row level security;
revoke all on public.project_shares from anon, authenticated;
grant select, insert, delete on public.project_shares to authenticated;
grant update (revoked_at) on public.project_shares to authenticated;
grant all on public.project_shares to service_role;
create policy project_shares_select_owner on public.project_shares for select to authenticated using ((select auth.uid()) = owner_id);
create policy project_shares_insert_owner on public.project_shares for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy project_shares_update_owner on public.project_shares for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy project_shares_delete_owner on public.project_shares for delete to authenticated using ((select auth.uid()) = owner_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['quiz_attempts', 'practice_stats', 'ai_usage_events', 'ai_messages']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)', table_name || '_select_owner', table_name);
  end loop;
end;
$$;

grant insert on public.ai_messages to authenticated;
create policy ai_messages_insert_owner on public.ai_messages for insert to authenticated with check ((select auth.uid()) = owner_id);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;
grant all on public.feedback to service_role;
create policy feedback_select_owner on public.feedback for select to authenticated using ((select auth.uid()) = owner_id);
create policy feedback_insert_owner on public.feedback for insert to authenticated with check ((select auth.uid()) = owner_id and status = 'new');

alter table public.network_templates enable row level security;
revoke all on public.network_templates from anon, authenticated;
grant select on public.network_templates to anon, authenticated;
grant all on public.network_templates to service_role;
create policy network_templates_public_read on public.network_templates for select to anon, authenticated using (true);

create function public.mutate_project(p_project_id uuid, p_expected_version integer, p_changes jsonb)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  updated_project public.projects;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 1 or p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'A positive expected version and an object of project changes are required.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('name', 'description', 'address_space', 'plan', 'archived')) then
    raise exception 'Project changes contain an unsupported field.' using errcode = '22023';
  end if;
  if (p_changes ? 'name' and jsonb_typeof(p_changes -> 'name') <> 'string')
    or (p_changes ? 'description' and jsonb_typeof(p_changes -> 'description') <> 'string')
    or (p_changes ? 'address_space' and jsonb_typeof(p_changes -> 'address_space') <> 'string')
    or (p_changes ? 'plan' and jsonb_typeof(p_changes -> 'plan') <> 'object')
    or (p_changes ? 'archived' and jsonb_typeof(p_changes -> 'archived') <> 'boolean') then
    raise exception 'Project change values have invalid types.' using errcode = '22023';
  end if;
  update public.projects p set
    name = case when p_changes ? 'name' then p_changes ->> 'name' else p.name end,
    description = case when p_changes ? 'description' then p_changes ->> 'description' else p.description end,
    address_space = case when p_changes ? 'address_space' then p_changes ->> 'address_space' else p.address_space end,
    plan = case when p_changes ? 'plan' then p_changes -> 'plan' else p.plan end,
    archived = case when p_changes ? 'archived' then (p_changes ->> 'archived')::boolean else p.archived end
  where p.id = p_project_id and p.owner_id = actor_id and p.version = p_expected_version
  returning p.* into updated_project;
  if not found then
    if exists (select 1 from public.projects p where p.id = p_project_id and p.owner_id = actor_id) then
      raise exception 'The project changed in another session. Reload it before saving.' using errcode = '40001';
    end if;
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;
  return updated_project;
end;
$$;

create function public.restore_project(p_project_id uuid, p_revision_id uuid, p_expected_version integer)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  revision_snapshot jsonb;
  restored_project public.projects;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select r.snapshot into revision_snapshot
  from public.project_revisions r
  where r.id = p_revision_id and r.project_id = p_project_id and r.owner_id = auth.uid();
  if not found then
    raise exception 'Revision not found.' using errcode = 'P0002';
  end if;
  if not (revision_snapshot ?& array['name', 'description', 'address_space', 'plan', 'archived']) then
    raise exception 'This revision does not contain a complete restorable project.' using errcode = '22023';
  end if;
  select * into restored_project from public.mutate_project(
    p_project_id,
    p_expected_version,
    jsonb_build_object(
      'name', revision_snapshot -> 'name',
      'description', revision_snapshot -> 'description',
      'address_space', revision_snapshot -> 'address_space',
      'plan', revision_snapshot -> 'plan',
      'archived', revision_snapshot -> 'archived'
    )
  );
  return restored_project;
end;
$$;

revoke all on function public.mutate_project(uuid, integer, jsonb) from public, anon;
revoke all on function public.restore_project(uuid, uuid, integer) from public, anon;
grant execute on function public.mutate_project(uuid, integer, jsonb) to authenticated;
grant execute on function public.restore_project(uuid, uuid, integer) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

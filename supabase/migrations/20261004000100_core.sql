create schema if not exists private;
create schema if not exists extensions;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create function private.protect_owned_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'The row identity, owner, and creation time are immutable.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  avatar_path text check (avatar_path is null or (char_length(avatar_path) <= 500 and avatar_path like id::text || '/%')),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 32768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 3000),
  address_space text not null default 'default' check (char_length(btrim(address_space)) between 1 and 100),
  plan jsonb not null default '{}'::jsonb check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 2097152),
  version integer not null default 1 check (version > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index projects_owner_archived_idx on public.projects (owner_id, archived, updated_at desc);

create table public.saved_networks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  parent_id uuid,
  paired_network_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  network cidr not null,
  purpose text not null default '' check (char_length(purpose) <= 500),
  vlan_id integer check (vlan_id between 1 and 4094),
  gateway inet,
  notes text not null default '' check (char_length(notes) <= 10000),
  locked boolean not null default false,
  reserved boolean not null default false,
  growth_percent numeric(7,2) not null default 0 check (growth_percent between 0 and 10000),
  position integer not null default 0 check (position >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, project_id, owner_id),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade,
  foreign key (parent_id, project_id, owner_id) references public.saved_networks(id, project_id, owner_id) on delete set null (parent_id),
  foreign key (paired_network_id, project_id, owner_id) references public.saved_networks(id, project_id, owner_id) on delete set null (paired_network_id),
  check (parent_id is null or parent_id <> id),
  check (paired_network_id is null or paired_network_id <> id),
  check (gateway is null or (family(gateway) = family(network) and network >>= gateway))
);

create index saved_networks_project_idx on public.saved_networks (owner_id, project_id, position);
create index saved_networks_parent_idx on public.saved_networks (parent_id, project_id, owner_id);
create index saved_networks_paired_idx on public.saved_networks (paired_network_id, project_id, owner_id);
create index saved_networks_network_idx on public.saved_networks using gist (network inet_ops);

create table public.saved_calculations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid,
  name text not null default '' check (char_length(name) <= 100),
  tool_id text not null check (char_length(btrim(tool_id)) between 1 and 100),
  input jsonb not null check (jsonb_typeof(input) = 'object' and octet_length(input::text) <= 262144),
  result jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete set null (project_id)
);

create index saved_calculations_owner_created_idx on public.saved_calculations (owner_id, created_at desc);
create index saved_calculations_project_idx on public.saved_calculations (project_id, owner_id);

create table public.vlsm_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  parent_network cidr not null check (family(parent_network) = 4),
  policy text not null default 'lan' check (policy in ('lan', 'point-to-point', 'aws', 'azure', 'gcp')),
  reserved jsonb not null default '[]'::jsonb check (jsonb_typeof(reserved) = 'array' and jsonb_array_length(reserved) <= 2048),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete set null (project_id)
);

create index vlsm_plans_owner_updated_idx on public.vlsm_plans (owner_id, updated_at desc);
create index vlsm_plans_project_idx on public.vlsm_plans (project_id, owner_id);

create table public.vlsm_segments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  required_hosts bigint not null check (required_hosts between 1 and 4294967296),
  growth_percent numeric(7,2) not null default 0 check (growth_percent between 0 and 10000),
  policy text check (policy in ('lan', 'point-to-point', 'aws', 'azure', 'gcp')),
  locked_cidr cidr check (locked_cidr is null or family(locked_cidr) = 4),
  allocated_network cidr check (allocated_network is null or family(allocated_network) = 4),
  capacity numeric(40,0) check (capacity >= 0 and capacity <= 4294967296),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_id, owner_id) references public.vlsm_plans(id, owner_id) on delete cascade
);

create index vlsm_segments_plan_idx on public.vlsm_segments (owner_id, plan_id, position);

create table public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  name text not null default '' check (char_length(name) <= 150),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 2200000),
  created_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);

create index project_revisions_project_created_idx on public.project_revisions (owner_id, project_id, created_at desc);

create table public.project_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 2200000),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade,
  check (expires_at > created_at and expires_at <= created_at + interval '90 days'),
  check (revoked_at is null or revoked_at >= created_at)
);

create index project_shares_project_created_idx on public.project_shares (owner_id, project_id, created_at desc);
create index project_shares_expiry_idx on public.project_shares (expires_at) where revoked_at is null;

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(btrim(question_id)) between 1 and 150),
  answer_index integer not null check (answer_index between 0 and 19),
  correct boolean not null,
  topic text not null check (char_length(btrim(topic)) between 1 and 100),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced', 'exam')),
  duration_ms integer not null check (duration_ms between 0 and 86400000),
  seed text check (seed is null or char_length(seed) <= 200),
  created_at timestamptz not null default now()
);

create index quiz_attempts_owner_created_idx on public.quiz_attempts (owner_id, created_at desc);
create index quiz_attempts_owner_topic_idx on public.quiz_attempts (owner_id, topic, difficulty, created_at desc);

create table public.practice_stats (
  owner_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 100),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced', 'exam')),
  attempts bigint not null default 0 check (attempts >= 0),
  correct_answers bigint not null default 0 check (correct_answers between 0 and attempts),
  total_duration_ms bigint not null default 0 check (total_duration_ms >= 0),
  best_streak bigint not null default 0 check (best_streak >= 0),
  current_streak bigint not null default 0 check (current_streak between 0 and best_streak),
  last_practiced_at timestamptz not null default now(),
  primary key (owner_id, topic, difficulty)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index ai_conversations_owner_updated_idx on public.ai_conversations (owner_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 100000),
  provider text check (provider is null or provider in ('mock', 'openai', 'anthropic', 'gemini')),
  mode text not null default 'live' check (mode in ('mock', 'demo', 'live')),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, owner_id) references public.ai_conversations(id, owner_id) on delete cascade
);

create index ai_messages_conversation_created_idx on public.ai_messages (owner_id, conversation_id, created_at, id);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  provider text not null check (provider in ('mock', 'openai', 'anthropic', 'gemini')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  status text not null check (status in ('completed', 'cancelled', 'failed', 'demo')),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, owner_id) references public.ai_conversations(id, owner_id) on delete set null (conversation_id)
);

create index ai_usage_events_owner_created_idx on public.ai_usage_events (owner_id, created_at desc);
create index ai_usage_events_conversation_idx on public.ai_usage_events (conversation_id, owner_id);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tool_id text not null check (char_length(btrim(tool_id)) between 1 and 150),
  label text not null default '' check (char_length(label) <= 150),
  created_at timestamptz not null default now(),
  unique (owner_id, tool_id)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  email text check (email is null or char_length(email) between 3 and 320),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  created_at timestamptz not null default now()
);

create index feedback_owner_created_idx on public.feedback (owner_id, created_at desc);
create index feedback_status_created_idx on public.feedback (status, created_at desc);

create table public.network_templates (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null check (char_length(description) <= 3000),
  category text not null check (category in ('home', 'smb', 'campus', 'data-center')),
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''), 100))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger subnetiq_profile_after_signup
after insert on auth.users
for each row execute function private.create_profile_for_user();

insert into public.profiles (id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'full_name', ''), 100)
from auth.users
on conflict (id) do nothing;

create function private.protect_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'The profile identity and creation time are immutable.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_identity_before_update
before update on public.profiles
for each row execute function private.protect_profile_identity();

create trigger profiles_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array['projects', 'saved_networks', 'saved_calculations', 'vlsm_plans', 'vlsm_segments', 'ai_conversations']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.protect_owned_identity()', table_name || '_identity_before_update', table_name);
    if table_name <> 'projects' then
      execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', table_name || '_updated_at', table_name);
    end if;
  end loop;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

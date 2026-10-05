create table private.lookup_cache (
  cache_key text primary key check (char_length(cache_key) between 1 and 256),
  kind text not null check (kind in ('dns', 'rdap', 'bootstrap', 'whois')),
  value jsonb not null check (octet_length(value::text) <= 2097152),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index lookup_cache_expiry_idx on private.lookup_cache (expires_at);
alter table private.lookup_cache enable row level security;
revoke all on private.lookup_cache from public, anon, authenticated;

create table private.api_usage_buckets (
  subject text not null check (char_length(subject) between 1 and 256),
  scope text not null check (char_length(scope) between 1 and 120),
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 2678400),
  used bigint not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject, scope, window_started_at, window_seconds)
);

create index api_usage_buckets_expiry_idx on private.api_usage_buckets (window_started_at);
alter table private.api_usage_buckets enable row level security;
revoke all on private.api_usage_buckets from public, anon, authenticated;

create function private.require_service_role()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This operation is restricted to the application service.' using errcode = '42501';
  end if;
end;
$$;

create function public.consume_api_quota(
  p_subject text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns table (allowed boolean, remaining bigint, retry_after_seconds integer, used bigint, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_instant timestamptz := pg_catalog.clock_timestamp();
  window_start timestamptz;
  window_reset timestamptz;
  bucket_used bigint;
begin
  perform private.require_service_role();
  if p_subject is null or char_length(p_subject) not between 1 and 256
    or p_scope is null or char_length(p_scope) not between 1 and 120
    or p_limit is null or p_limit not between 1 and 1000000000
    or p_window_seconds is null or p_window_seconds not between 1 and 2678400
    or p_cost is null or p_cost not between 1 and 1000000000 then
    raise exception 'Quota subject, scope, limit, window, or cost is invalid.' using errcode = '22023';
  end if;
  window_start := to_timestamp(floor(extract(epoch from current_instant) / p_window_seconds) * p_window_seconds);
  window_reset := window_start + make_interval(secs => p_window_seconds);
  insert into private.api_usage_buckets (subject, scope, window_started_at, window_seconds, used)
  values (p_subject, p_scope, window_start, p_window_seconds, 0)
  on conflict (subject, scope, window_started_at, window_seconds) do nothing;
  update private.api_usage_buckets b
  set used = b.used + p_cost, updated_at = current_instant
  where b.subject = p_subject and b.scope = p_scope and b.window_started_at = window_start
    and b.window_seconds = p_window_seconds and b.used <= p_limit::bigint - p_cost::bigint
  returning b.used into bucket_used;
  if found then
    return query select true, greatest(0::bigint, p_limit::bigint - bucket_used), 0, bucket_used, window_reset;
  else
    select b.used into bucket_used from private.api_usage_buckets b
    where b.subject = p_subject and b.scope = p_scope and b.window_started_at = window_start and b.window_seconds = p_window_seconds;
    return query select false, greatest(0::bigint, p_limit::bigint - bucket_used),
      greatest(1, ceil(extract(epoch from (window_reset - current_instant)))::integer), bucket_used, window_reset;
  end if;
end;
$$;

create function public.get_lookup_cache(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cached_value jsonb;
begin
  perform private.require_service_role();
  if p_key is null or char_length(p_key) not between 1 and 256 then
    raise exception 'A valid lookup cache key is required.' using errcode = '22023';
  end if;
  select c.value into cached_value from private.lookup_cache c
  where c.cache_key = p_key and c.expires_at > pg_catalog.clock_timestamp();
  return cached_value;
end;
$$;

create function public.put_lookup_cache(p_key text, p_kind text, p_value jsonb, p_ttl_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_instant timestamptz := pg_catalog.clock_timestamp();
begin
  perform private.require_service_role();
  if p_key is null or char_length(p_key) not between 1 and 256
    or p_kind is null or p_kind not in ('dns', 'rdap', 'bootstrap', 'whois')
    or p_value is null or octet_length(p_value::text) > 2097152
    or p_ttl_seconds is null or p_ttl_seconds not between 1 and 86400 then
    raise exception 'Lookup cache key, kind, value, or TTL is invalid.' using errcode = '22023';
  end if;
  insert into private.lookup_cache (cache_key, kind, value, expires_at, updated_at)
  values (p_key, p_kind, p_value, current_instant + make_interval(secs => p_ttl_seconds), current_instant)
  on conflict (cache_key) do update set
    kind = excluded.kind,
    value = excluded.value,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;
end;
$$;

create function public.resolve_shared_project(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_snapshot jsonb;
begin
  perform private.require_service_role();
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select s.snapshot into shared_snapshot
  from public.project_shares s
  where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > pg_catalog.clock_timestamp();
  return shared_snapshot;
end;
$$;

create function public.purge_expired_service_data()
returns table (cache_deleted bigint, quota_deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_cache bigint;
  deleted_quotas bigint;
begin
  perform private.require_service_role();
  delete from private.lookup_cache where expires_at <= pg_catalog.clock_timestamp();
  get diagnostics deleted_cache = row_count;
  delete from private.api_usage_buckets
  where window_started_at + make_interval(secs => window_seconds) < pg_catalog.clock_timestamp() - interval '7 days';
  get diagnostics deleted_quotas = row_count;
  return query select deleted_cache, deleted_quotas;
end;
$$;

create function public.purge_quota_subject(p_subject text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  if p_subject is null or char_length(p_subject) not between 1 and 256 then
    raise exception 'A valid quota subject is required.' using errcode = '22023';
  end if;
  delete from private.api_usage_buckets where subject = p_subject;
end;
$$;

revoke all on function public.consume_api_quota(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.get_lookup_cache(text) from public, anon, authenticated;
revoke all on function public.put_lookup_cache(text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.resolve_shared_project(text) from public, anon, authenticated;
revoke all on function public.purge_expired_service_data() from public, anon, authenticated;
revoke all on function public.purge_quota_subject(text) from public, anon, authenticated;
grant execute on function public.consume_api_quota(text, text, integer, integer, integer) to service_role;
grant execute on function public.get_lookup_cache(text) to service_role;
grant execute on function public.put_lookup_cache(text, text, jsonb, integer) to service_role;
grant execute on function public.resolve_shared_project(text) to service_role;
grant execute on function public.purge_expired_service_data() to service_role;
grant execute on function public.purge_quota_subject(text) to service_role;
revoke all on all functions in schema private from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('exports', 'exports', false, 26214400, array['application/pdf', 'text/csv', 'application/csv', 'application/json', 'application/zip', 'text/plain']),
  ('avatars', 'avatars', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy subnetiq_storage_path_fence
on storage.objects as restrictive for all to anon, authenticated
using (
  bucket_id not in ('exports', 'avatars')
  or ((select auth.uid()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text)
)
with check (
  bucket_id not in ('exports', 'avatars')
  or ((select auth.uid()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text)
);

create policy subnetiq_storage_select_owner
on storage.objects for select to authenticated
using (bucket_id in ('exports', 'avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy subnetiq_storage_insert_owner
on storage.objects for insert to authenticated
with check (bucket_id in ('exports', 'avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy subnetiq_storage_update_owner
on storage.objects for update to authenticated
using (bucket_id in ('exports', 'avatars') and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id in ('exports', 'avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy subnetiq_storage_delete_owner
on storage.objects for delete to authenticated
using (bucket_id in ('exports', 'avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);

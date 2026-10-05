begin;

create schema subnetiq_test;
create table subnetiq_test.results (
  number integer generated always as identity primary key,
  passed boolean not null,
  description text not null
);

create function subnetiq_test.check_result(p_condition boolean, p_description text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  assertion_number integer;
begin
  insert into subnetiq_test.results (passed, description)
  values (p_condition is true, p_description)
  returning number into assertion_number;
  return case when p_condition is true then 'ok ' else 'not ok ' end || assertion_number::text || ' - ' || p_description;
end;
$$;

create function subnetiq_test.expect_error(p_query text, p_expected_code text, p_description text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actual_code text;
  actual_message text;
  assertion_text text;
begin
  begin
    execute p_query;
  exception when others then
    get stacked diagnostics actual_code = returned_sqlstate, actual_message = message_text;
  end;
  assertion_text := subnetiq_test.check_result(actual_code = p_expected_code, p_description);
  if actual_code is distinct from p_expected_code then
    assertion_text := assertion_text || E'\n# Expected SQLSTATE ' || p_expected_code || ', received ' || coalesce(actual_code, 'no error') || ': ' || coalesce(actual_message, 'statement succeeded');
  end if;
  return assertion_text;
end;
$$;

create function subnetiq_test.set_claims(p_user uuid, p_role text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', p_role)::text, true);
end;
$$;

grant usage on schema subnetiq_test to anon, authenticated, service_role;
grant execute on all functions in schema subnetiq_test to anon, authenticated, service_role;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Owner A"}'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'owner-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Owner B"}');

insert into public.projects (id, owner_id, name, plan)
values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Project A', '{"networks":[]}'),
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Project B', '{"networks":[]}');

insert into public.saved_networks (id, owner_id, project_id, name, network)
values
  ('a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'A parent', '10.50.0.0/16'),
  ('b0000000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001', 'B parent', '10.60.0.0/16');

insert into public.saved_networks (id, owner_id, project_id, parent_id, name, network)
values ('a0000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000010', 'A child', '10.50.10.0/24');

insert into public.saved_calculations (owner_id, project_id, name, tool_id, input, result)
values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'A calculation', 'ipv4-subnet', '{"address":"10.50.0.1/24"}', '{"toolId":"ipv4-subnet"}'),
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001', 'B calculation', 'ipv4-subnet', '{"address":"10.60.0.1/24"}', '{"toolId":"ipv4-subnet"}');

insert into public.vlsm_plans (id, owner_id, project_id, name, parent_network)
values
  ('a0000000-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'A VLSM', '10.50.0.0/16'),
  ('b0000000-0000-4000-8000-000000000020', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001', 'B VLSM', '10.60.0.0/16');

insert into public.vlsm_segments (owner_id, plan_id, name, required_hosts, allocated_network, capacity)
values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000020', 'A department', 30, '10.50.0.0/27', 30),
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000020', 'B department', 30, '10.60.0.0/27', 30);

insert into public.project_revisions (id, owner_id, project_id, name, snapshot)
select 'a0000000-0000-4000-8000-000000000030', p.owner_id, p.id, 'Initial checkpoint', to_jsonb(p) - 'owner_id'
from public.projects p where p.id = 'a0000000-0000-4000-8000-000000000001';

insert into public.project_revisions (id, owner_id, project_id, name, snapshot)
select 'b0000000-0000-4000-8000-000000000030', p.owner_id, p.id, 'Initial checkpoint', to_jsonb(p) - 'owner_id'
from public.projects p where p.id = 'b0000000-0000-4000-8000-000000000001';

insert into public.project_shares (id, owner_id, project_id, token_hash, snapshot, created_at, expires_at, revoked_at)
values
  ('a0000000-0000-4000-8000-000000000040', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', repeat('a', 64), '{}', now(), now() + interval '1 day', null),
  ('a0000000-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', repeat('b', 64), '{}', now() - interval '2 days', now() - interval '1 day', null),
  ('a0000000-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', repeat('c', 64), '{}', now(), now() + interval '1 day', now()),
  ('b0000000-0000-4000-8000-000000000040', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000001', repeat('d', 64), '{}', now(), now() + interval '1 day', null);

insert into public.ai_conversations (id, owner_id, title)
values
  ('a0000000-0000-4000-8000-000000000050', '11111111-1111-4111-8111-111111111111', 'Conversation A'),
  ('b0000000-0000-4000-8000-000000000050', '22222222-2222-4222-8222-222222222222', 'Conversation B');

insert into public.ai_messages (owner_id, conversation_id, role, content, provider, mode)
values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000050', 'user', 'Explain /31.', 'mock', 'mock'),
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000050', 'user', 'Explain /127.', 'mock', 'mock');

insert into public.ai_usage_events (owner_id, conversation_id, provider, input_tokens, output_tokens, status)
values
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000050', 'mock', 10, 20, 'demo'),
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000050', 'mock', 10, 20, 'demo');

insert into public.quiz_attempts (owner_id, question_id, answer_index, correct, topic, difficulty, duration_ms)
values
  ('11111111-1111-4111-8111-111111111111', 'fixture-1', 0, true, 'CIDR', 'beginner', 100),
  ('11111111-1111-4111-8111-111111111111', 'fixture-2', 1, true, 'CIDR', 'beginner', 200),
  ('11111111-1111-4111-8111-111111111111', 'fixture-3', 0, false, 'CIDR', 'beginner', 300),
  ('22222222-2222-4222-8222-222222222222', 'fixture-1', 0, true, 'CIDR', 'beginner', 100);

insert into public.favorites (owner_id, tool_id)
values ('11111111-1111-4111-8111-111111111111', 'ipv4-subnet'), ('22222222-2222-4222-8222-222222222222', 'ipv6-subnet');

insert into public.feedback (owner_id, message)
values ('11111111-1111-4111-8111-111111111111', 'Feedback A'), ('22222222-2222-4222-8222-222222222222', 'Feedback B');

insert into storage.objects (bucket_id, name, owner_id)
values
  ('exports', '11111111-1111-4111-8111-111111111111/report.json', null),
  ('exports', '22222222-2222-4222-8222-222222222222/report.json', '22222222-2222-4222-8222-222222222222'),
  ('avatars', '11111111-1111-4111-8111-111111111111/avatar.png', '11111111-1111-4111-8111-111111111111');

grant select, insert, update, delete on storage.objects to anon, authenticated;
create policy subnetiq_test_permissive_storage on storage.objects for all to anon, authenticated using (true) with check (true);

select subnetiq_test.check_result(
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('profiles', 'projects', 'saved_networks', 'saved_calculations', 'vlsm_plans', 'vlsm_segments', 'project_revisions', 'project_shares', 'quiz_attempts', 'practice_stats', 'ai_conversations', 'ai_messages', 'ai_usage_events', 'favorites', 'feedback', 'network_templates') and not c.relrowsecurity),
  'Every application table enables row-level security'
);
select subnetiq_test.check_result((select count(*) = 4 from public.network_templates), 'Four sample templates are seeded');
select subnetiq_test.check_result(not exists (
  select 1 from public.network_templates t cross join lateral jsonb_array_elements(t.plan -> 'networks') n
  where not ((t.plan ->> 'parent')::cidr >>= (n ->> 'cidr')::cidr)
), 'Every example IPv4 allocation fits its documented parent');
select subnetiq_test.check_result(not exists (
  select 1 from public.network_templates t cross join lateral jsonb_array_elements(t.plan -> 'networks') n
  where not ((t.plan ->> 'ipv6Parent')::cidr >>= (n ->> 'ipv6')::cidr)
), 'Every paired IPv6 example fits its documented parent');
select subnetiq_test.check_result(not exists (
  select 1 from public.network_templates t cross join lateral jsonb_array_elements(t.plan -> 'networks') n
  where n ? 'gateway' and not ((n ->> 'cidr')::cidr >>= (n ->> 'gateway')::inet)
), 'Every example gateway belongs to its allocated network');
select subnetiq_test.check_result(not exists (
  select 1 from public.network_templates t
  cross join lateral jsonb_array_elements(t.plan -> 'networks') with ordinality a(network, position)
  cross join lateral jsonb_array_elements(t.plan -> 'networks') with ordinality b(network, position)
  where a.position < b.position and ((a.network ->> 'cidr')::cidr >>= (b.network ->> 'cidr')::cidr or (b.network ->> 'cidr')::cidr >>= (a.network ->> 'cidr')::cidr)
), 'Example endpoint and link allocations do not overlap');
select subnetiq_test.check_result((select count(*) = 2 from public.profiles where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')), 'Signup creates both profiles');
select subnetiq_test.check_result((select display_name = 'Owner A' from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'Profile display name comes from bounded signup metadata');
select subnetiq_test.check_result(not has_function_privilege('authenticated', 'public.consume_api_quota(text,text,integer,integer,integer)', 'EXECUTE'), 'Users cannot call privileged quota functions');
select subnetiq_test.check_result(not has_function_privilege('anon', 'public.resolve_shared_project(text)', 'EXECUTE'), 'Anonymous callers cannot invoke the share resolver directly');
select subnetiq_test.check_result((select bool_and(not public) from storage.buckets where id in ('exports', 'avatars')), 'Export and avatar buckets are private');

set local role anon;
select subnetiq_test.set_claims(null, 'anon');
select subnetiq_test.check_result((select count(*) = 4 from public.network_templates), 'Guests can read published example templates');
select subnetiq_test.expect_error('select * from public.projects', '42501', 'Guests cannot select private projects');
select subnetiq_test.expect_error('select * from public.project_shares', '42501', 'Guests cannot enumerate share hashes or snapshots');
select subnetiq_test.expect_error('select * from public.ai_messages', '42501', 'Guests cannot read AI conversations');
select subnetiq_test.expect_error('select * from private.lookup_cache', '42501', 'Guests cannot read the private cache');
select subnetiq_test.expect_error('select public.resolve_shared_project(repeat(''a'',64))', '42501', 'Guests cannot bypass the public API to resolve a share');
select subnetiq_test.check_result((select count(*) = 0 from storage.objects where bucket_id in ('exports', 'avatars')), 'Restrictive Storage policy blocks guests despite another permissive policy');
select subnetiq_test.expect_error('insert into public.network_templates(id,name,description,category,plan) values(''injected'',''X'','''',''home'',''{}'')', '42501', 'Guests cannot modify reference templates');

reset role;
select subnetiq_test.set_claims('11111111-1111-4111-8111-111111111111', 'authenticated');
set local role authenticated;
select subnetiq_test.check_result((select count(*) = 1 from public.projects), 'An owner sees only their project');
select subnetiq_test.check_result((select count(*) = 1 from public.profiles), 'An owner sees only their profile');
select subnetiq_test.check_result((select count(*) = 2 from public.saved_networks), 'Saved network hierarchy is isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.saved_calculations), 'Saved calculations are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.vlsm_plans), 'VLSM plans are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.vlsm_segments), 'VLSM segments are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.project_revisions), 'Project revisions are isolated by owner');
select subnetiq_test.check_result((select count(*) = 3 from public.project_shares), 'Share records are isolated by owner');
select subnetiq_test.check_result((select count(*) = 3 from public.quiz_attempts), 'Quiz attempts are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.practice_stats), 'Practice summaries are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.ai_conversations), 'Conversation headers are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.ai_messages), 'Conversation messages are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.ai_usage_events), 'AI usage events are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.favorites), 'Favorites are isolated by owner');
select subnetiq_test.check_result((select count(*) = 1 from public.feedback), 'Feedback is isolated by owner');
select subnetiq_test.check_result((select count(*) = 2 from storage.objects where bucket_id in ('exports', 'avatars')), 'Owners can read their private paths including a service-created export');
select subnetiq_test.check_result((select attempts = 3 and correct_answers = 2 and total_duration_ms = 600 and best_streak = 2 and current_streak = 0 from public.practice_stats), 'Trusted attempts maintain score, time, and streak counters');
select subnetiq_test.expect_error('insert into public.projects(owner_id,name) values(''22222222-2222-4222-8222-222222222222'',''Forged owner'')', '42501', 'WITH CHECK prevents inserting a project for another user');
select subnetiq_test.expect_error('update public.projects set owner_id = ''22222222-2222-4222-8222-222222222222'' where id = ''a0000000-0000-4000-8000-000000000001''', '22023', 'An existing project cannot transfer its owner');
with changed as (update public.projects set name = 'Intrusion' where id = 'b0000000-0000-4000-8000-000000000001' returning id) select subnetiq_test.check_result((select count(*) = 0 from changed), 'USING prevents an update to another user project');
with removed as (delete from public.projects where id = 'b0000000-0000-4000-8000-000000000001' returning id) select subnetiq_test.check_result((select count(*) = 0 from removed), 'USING prevents deleting another user project');
select subnetiq_test.expect_error('insert into public.saved_calculations(owner_id,project_id,tool_id,input,result) values(''11111111-1111-4111-8111-111111111111'',''b0000000-0000-4000-8000-000000000001'',''ipv4-subnet'',''{}'',''{}'')', '23503', 'Composite ownership rejects a saved result linked to another user project');
select subnetiq_test.expect_error('insert into public.saved_networks(owner_id,project_id,name,network) values(''11111111-1111-4111-8111-111111111111'',''b0000000-0000-4000-8000-000000000001'',''Intrusion'',''10.60.1.0/24'')', '23503', 'Composite ownership rejects a network linked to another user project');
select subnetiq_test.expect_error('insert into public.ai_messages(owner_id,conversation_id,role,content) values(''11111111-1111-4111-8111-111111111111'',''b0000000-0000-4000-8000-000000000050'',''user'',''Intrusion'')', '23503', 'A message cannot link to another owner conversation');
select subnetiq_test.expect_error('insert into public.vlsm_segments(owner_id,plan_id,name,required_hosts) values(''11111111-1111-4111-8111-111111111111'',''b0000000-0000-4000-8000-000000000020'',''Intrusion'',10)', '23503', 'A VLSM segment cannot link to another owner plan');
select subnetiq_test.expect_error('insert into public.project_revisions(owner_id,project_id,snapshot) values(''11111111-1111-4111-8111-111111111111'',''b0000000-0000-4000-8000-000000000001'',''{}'')', '23503', 'A revision cannot link to another owner project');
select subnetiq_test.expect_error('insert into public.saved_networks(project_id,parent_id,name,network) values(''a0000000-0000-4000-8000-000000000001'',''a0000000-0000-4000-8000-000000000010'',''Outside'',''10.70.0.0/24'')', '23514', 'A child outside its parent network is rejected');
select subnetiq_test.expect_error('update public.saved_networks set network = ''10.50.0.0/24'' where id = ''a0000000-0000-4000-8000-000000000010''', '23514', 'Shrinking a parent cannot strand existing child allocations');
select subnetiq_test.expect_error('insert into public.saved_networks(project_id,name,network,gateway) values(''a0000000-0000-4000-8000-000000000001'',''Wrong gateway'',''10.50.20.0/24'',''10.60.0.1'')', '23514', 'Gateway must belong to its subnet');
select subnetiq_test.expect_error('insert into public.saved_networks(project_id,name,network) values(''a0000000-0000-4000-8000-000000000001'',''Host bits'',''10.50.0.1/24'')', '22P02', 'Stored CIDR networks reject noncanonical host bits');
select subnetiq_test.expect_error('insert into public.saved_networks(project_id,paired_network_id,name,network) values(''a0000000-0000-4000-8000-000000000001'',''a0000000-0000-4000-8000-000000000010'',''Wrong pair'',''10.50.20.0/24'')', '23514', 'A dual-stack pair requires different IP versions');
select subnetiq_test.expect_error('insert into public.vlsm_plans(name,parent_network,reserved) values(''Bad reservation'',''10.0.0.0/24'',''["10.0.1.0/24"]'')', '23514', 'Reservations must fit the VLSM parent');
select subnetiq_test.expect_error('insert into public.vlsm_segments(plan_id,name,required_hosts,locked_cidr,allocated_network) values(''a0000000-0000-4000-8000-000000000020'',''Moved lock'',10,''10.50.20.0/28'',''10.50.21.0/28'')', '23514', 'Locked allocations cannot silently move');
select subnetiq_test.expect_error('insert into public.quiz_attempts(owner_id,question_id,answer_index,correct,topic,difficulty,duration_ms) values(''11111111-1111-4111-8111-111111111111'',''forged'',0,true,''CIDR'',''beginner'',1)', '42501', 'A user cannot forge a correctly graded attempt');
select subnetiq_test.expect_error('update public.practice_stats set correct_answers = attempts', '42501', 'A user cannot overwrite authoritative practice statistics');
select subnetiq_test.expect_error('insert into public.ai_usage_events(owner_id,provider,status) values(''11111111-1111-4111-8111-111111111111'',''openai'',''completed'')', '42501', 'A user cannot forge AI accounting records');
select subnetiq_test.expect_error('update public.project_revisions set name = ''Rewritten history''', '42501', 'Existing revisions are append-only for users');
select subnetiq_test.expect_error('update public.project_shares set snapshot = ''{"name":"changed"}'' where id = ''a0000000-0000-4000-8000-000000000040''', '42501', 'A share owner cannot edit a published snapshot');
select subnetiq_test.expect_error('insert into storage.objects(bucket_id,name) values(''exports'',''22222222-2222-4222-8222-222222222222/stolen.json'')', '42501', 'Storage WITH CHECK prevents writing into another user path');
select subnetiq_test.expect_error('update storage.objects set name = ''22222222-2222-4222-8222-222222222222/moved.json'' where bucket_id = ''exports'' and name = ''11111111-1111-4111-8111-111111111111/report.json''', '42501', 'Storage WITH CHECK prevents moving a file into another user path');

select subnetiq_test.check_result((select version = 2 and name = 'Project A revised' from public.mutate_project('a0000000-0000-4000-8000-000000000001', 1, '{"name":"Project A revised"}')), 'Atomic project mutation advances version and writes the requested name');
select subnetiq_test.check_result((select count(*) = 2 from public.project_revisions), 'Mutation atomically preserves the prior project revision');
select subnetiq_test.check_result((select snapshot ->> 'name' = 'Project A' from public.project_shares where id = 'a0000000-0000-4000-8000-000000000040'), 'Private edits do not change an existing public snapshot');
select subnetiq_test.expect_error('select public.mutate_project(''a0000000-0000-4000-8000-000000000001'',1,''{"name":"Lost update"}'')', '40001', 'A stale expected version rejects a lost update');
select subnetiq_test.check_result((select count(*) = 2 from public.project_revisions), 'A rejected mutation does not create a misleading revision');
select subnetiq_test.check_result((select name = 'Project A' and version = 3 from public.restore_project('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000030', 2)), 'Restore creates a new version from an owned revision');
select subnetiq_test.check_result((select count(*) = 3 from public.project_revisions), 'Restore preserves the state it replaces');
select subnetiq_test.check_result((select version = 3 from public.mutate_project('a0000000-0000-4000-8000-000000000001', 3, '{}')), 'A no-op mutation preserves the existing version');
select subnetiq_test.expect_error('select public.mutate_project(''b0000000-0000-4000-8000-000000000001'',1,''{"name":"Intrusion"}'')', 'P0002', 'Mutating an unrelated project does not reveal its existence');
select subnetiq_test.expect_error('select public.mutate_project(''a0000000-0000-4000-8000-000000000001'',3,''{"owner_id":"x"}'')', '22023', 'Mutation rejects fields outside the public contract');
select subnetiq_test.expect_error('select public.mutate_project(''a0000000-0000-4000-8000-000000000001'',3,''{"plan":[]}'')', '22023', 'Mutation rejects a malformed plan type');
select subnetiq_test.expect_error('select public.restore_project(''a0000000-0000-4000-8000-000000000001'',''b0000000-0000-4000-8000-000000000030'',3)', 'P0002', 'Restore rejects a revision from another project');

insert into public.project_shares (owner_id, project_id, token_hash, snapshot, expires_at)
values ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', repeat('e',64), '{"owner_id":"injected","name":"forged snapshot"}', now() + interval '1 day');
select subnetiq_test.check_result((select not (snapshot ? 'owner_id') and snapshot ->> 'name' = 'Project A' from public.project_shares where token_hash = repeat('e',64)), 'New share snapshots are captured from the actual owned project and omit owner identity');
select subnetiq_test.expect_error('insert into public.project_shares(project_id,token_hash,snapshot,expires_at) values(''a0000000-0000-4000-8000-000000000001'',repeat(''f'',64),''{}'',now() + interval ''91 days'')', '23514', 'Share expiry cannot exceed ninety days');

reset role;
select subnetiq_test.set_claims('22222222-2222-4222-8222-222222222222', 'authenticated');
set local role authenticated;
select subnetiq_test.check_result((select count(*) = 1 and min(name) = 'Project B' from public.projects), 'An unrelated user sees their unchanged project');
select subnetiq_test.check_result((select count(*) = 1 from public.project_shares), 'An unrelated user cannot enumerate the owner share records');
with changed as (update public.project_shares set revoked_at = now() where id = 'a0000000-0000-4000-8000-000000000040' returning id) select subnetiq_test.check_result((select count(*) = 0 from changed), 'An unrelated user cannot revoke the owner share');
select subnetiq_test.check_result((select count(*) = 1 from storage.objects where bucket_id in ('exports', 'avatars')), 'Storage paths remain isolated for the second user');

reset role;
insert into private.lookup_cache (cache_key, kind, value, expires_at) values ('expired-fixture', 'dns', '{"expired":true}', now() - interval '1 second');
select subnetiq_test.set_claims(null, 'service_role');
set local role service_role;
select subnetiq_test.check_result(public.resolve_shared_project(repeat('a',64)) ->> 'name' = 'Project A', 'The service resolves the original immutable shared snapshot');
select subnetiq_test.check_result(public.resolve_shared_project(repeat('b',64)) is null, 'Expired shares never resolve');
select subnetiq_test.check_result(public.resolve_shared_project(repeat('c',64)) is null, 'Revoked shares never resolve');
select subnetiq_test.check_result(public.resolve_shared_project(repeat('0',64)) is null, 'Unknown share hashes return the same empty result');
select subnetiq_test.check_result(public.resolve_shared_project('invalid') is null, 'Malformed share hashes do not resolve');
select public.put_lookup_cache('fixture-dns', 'dns', '{"answers":["192.0.2.10"]}', 60);
select subnetiq_test.check_result(public.get_lookup_cache('fixture-dns') = '{"answers":["192.0.2.10"]}'::jsonb, 'The service can write and read a bounded lookup cache value');
select subnetiq_test.check_result(public.get_lookup_cache('expired-fixture') is null, 'Expired cache entries are never returned');
select subnetiq_test.expect_error('select public.put_lookup_cache(''bad-ttl'',''dns'',''{}'',0)', '22023', 'A cache write rejects invalid TTL');
select subnetiq_test.check_result((select allowed and remaining = 2 and used = 1 from public.consume_api_quota('fixture-user', 'ai', 3, 3600)), 'First quota request consumes one unit atomically');
select subnetiq_test.check_result((select allowed and remaining = 0 and used = 3 from public.consume_api_quota('fixture-user', 'ai', 3, 3600, 2)), 'A weighted quota request consumes the remaining units');
select subnetiq_test.check_result((select not allowed and remaining = 0 and used = 3 and retry_after_seconds > 0 from public.consume_api_quota('fixture-user', 'ai', 3, 3600)), 'An exhausted quota rejects without increasing recorded usage');
select subnetiq_test.check_result((select allowed and used = 1 from public.consume_api_quota('fixture-user', 'dns', 3, 3600)), 'Quota scopes are independent');
select subnetiq_test.check_result((select allowed and used = 1 from public.consume_api_quota('fixture-other', 'ai', 3, 3600)), 'Quota subjects are independent');
select subnetiq_test.expect_error('select public.consume_api_quota(''fixture-user'',''ai'',3,0)', '22023', 'Zero-length quota windows are rejected');
select subnetiq_test.check_result((select cache_deleted >= 1 from public.purge_expired_service_data()), 'The service can remove expired cache data');
select public.purge_quota_subject('fixture-user');
select subnetiq_test.check_result((select allowed and used = 1 and remaining = 2 from public.consume_api_quota('fixture-user', 'ai', 3, 3600)), 'Account cleanup removes every quota bucket for its subject');
select subnetiq_test.check_result((select allowed and used = 2 from public.consume_api_quota('fixture-other', 'ai', 3, 3600)), 'Account quota cleanup preserves unrelated subjects');
select subnetiq_test.expect_error('select public.purge_quota_subject('''')', '22023', 'Quota cleanup rejects an empty subject');
select subnetiq_test.expect_error('update public.project_shares set snapshot = ''{"name":"rewritten"}'' where id = ''a0000000-0000-4000-8000-000000000040''', '22023', 'Snapshot immutability is also enforced on privileged table updates');

reset role;
select subnetiq_test.set_claims('11111111-1111-4111-8111-111111111111', 'authenticated');
set local role authenticated;
update public.project_shares set revoked_at = now() where id = 'a0000000-0000-4000-8000-000000000040';
select subnetiq_test.check_result((select revoked_at is not null from public.project_shares where id = 'a0000000-0000-4000-8000-000000000040'), 'An owner can revoke an active share');
select subnetiq_test.expect_error('update public.project_shares set revoked_at = null where id = ''a0000000-0000-4000-8000-000000000040''', '22023', 'A revoked link cannot be reactivated');
select subnetiq_test.expect_error('select public.get_lookup_cache(''fixture-dns'')', '42501', 'Authenticated users cannot read private lookup cache RPCs');
select subnetiq_test.expect_error('select public.purge_quota_subject(''fixture-other'')', '42501', 'Users cannot reset their quota accounting directly');
select subnetiq_test.set_claims('11111111-1111-4111-8111-111111111111', 'service_role');
select subnetiq_test.expect_error('select public.consume_api_quota(''forged'',''ai'',3,3600)', '42501', 'A forged claim cannot overcome database function grants');

reset role;
select subnetiq_test.set_claims(null, 'service_role');
set local role service_role;
select subnetiq_test.check_result(public.resolve_shared_project(repeat('a',64)) is null, 'Revocation immediately removes resolver access');

reset role;
delete from storage.objects where (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111';
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select subnetiq_test.check_result((select count(*) = 0 from public.projects where owner_id = '11111111-1111-4111-8111-111111111111'), 'Account deletion cascades through projects');
select subnetiq_test.check_result((select count(*) = 0 from public.saved_networks where owner_id = '11111111-1111-4111-8111-111111111111'), 'Account deletion cascades through saved network hierarchy');
select subnetiq_test.check_result((select count(*) = 0 from public.project_shares where owner_id = '11111111-1111-4111-8111-111111111111'), 'Account deletion invalidates all owned share links');
select subnetiq_test.check_result((select count(*) = 0 from public.ai_messages where owner_id = '11111111-1111-4111-8111-111111111111'), 'Account deletion removes owned conversation content');
select subnetiq_test.check_result((select count(*) = 0 from public.practice_stats where owner_id = '11111111-1111-4111-8111-111111111111'), 'Account deletion removes owned practice statistics');
select subnetiq_test.check_result((select count(*) = 1 from public.projects where owner_id = '22222222-2222-4222-8222-222222222222'), 'Deleting one account preserves another owner data');

select '1..' || count(*)::text from subnetiq_test.results;
rollback;

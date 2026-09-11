begin;
select plan(18);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'workspaces', 'workspaces exists');
select has_table('public', 'workspace_members', 'workspace_members exists');
select has_table('public', 'workspace_invitations', 'workspace_invitations exists');
select has_function('public', 'complete_onboarding', array['text', 'text', 'text', 'text'], 'onboarding RPC exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.workspaces'::regclass), 'workspaces has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.workspace_members'::regclass), 'memberships have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.workspace_invitations'::regclass), 'invitations have RLS');

select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'profiles'), 2, 'profiles has explicit select/update policies');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'workspaces'), 1, 'workspaces has member policy');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'workspace_members'), 1, 'memberships have self policy');
select policies_are(
  'public',
  'workspace_invitations',
  array['workspace_invitations_no_direct_access'],
  'invitations have an explicit deny-all policy'
);

select has_index(
  'public',
  'workspace_invitations',
  'workspace_invitations_created_by_idx',
  'invitations index the creator foreign key'
);

select has_index(
  'public',
  'workspace_invitations',
  'workspace_invitations_accepted_by_idx',
  'invitations index the accepting user foreign key'
);

select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon cannot read profiles');
select ok(not has_function_privilege('anon', 'public.complete_onboarding(text,text,text,text)', 'EXECUTE'), 'anon cannot run onboarding');
select ok(has_function_privilege('authenticated', 'public.complete_onboarding(text,text,text,text)', 'EXECUTE'), 'authenticated can run onboarding');

select * from finish();
rollback;

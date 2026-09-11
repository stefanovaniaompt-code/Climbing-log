-- Invitation rows stay inaccessible through the Data API. They are consumed only
-- by narrowly scoped SECURITY DEFINER functions such as complete_onboarding().
create policy workspace_invitations_no_direct_access
on public.workspace_invitations for all
to authenticated
using (false)
with check (false);

create index workspace_invitations_created_by_idx
on public.workspace_invitations (created_by);

create index workspace_invitations_accepted_by_idx
on public.workspace_invitations (accepted_by)
where accepted_by is not null;


-- RLS already restricts updates to the owning coach or the invited athlete.
-- This table-level grant makes those policies reachable through the Data API.
grant update on table public.athlete_invitations to authenticated;

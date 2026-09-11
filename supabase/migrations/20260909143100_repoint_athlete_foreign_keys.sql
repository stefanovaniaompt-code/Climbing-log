-- Compatibility checkpoint: legacy athlete UUIDs were preserved in public.athletes.
-- Only the referenced parent changes; no child value is rewritten.
alter table public.coach_athletes drop constraint coach_athletes_athlete_id_fkey;
alter table public.coach_athletes add constraint coach_athletes_athlete_id_fkey foreign key (athlete_id) references public.athletes(id) on delete cascade;

alter table public.programs drop constraint programs_athlete_id_fkey;
alter table public.programs add constraint programs_athlete_id_fkey foreign key (athlete_id) references public.athletes(id) on delete cascade;

alter table public.session_logs drop constraint session_logs_athlete_id_fkey;
alter table public.session_logs add constraint session_logs_athlete_id_fkey foreign key (athlete_id) references public.athletes(id) on delete cascade;

alter table public.exercise_logs drop constraint exercise_logs_athlete_id_fkey;
alter table public.exercise_logs add constraint exercise_logs_athlete_id_fkey foreign key (athlete_id) references public.athletes(id) on delete cascade;

alter table public.test_sessions drop constraint test_sessions_athlete_id_fkey;
alter table public.test_sessions add constraint test_sessions_athlete_id_fkey foreign key (athlete_id) references public.athletes(id) on delete cascade;

alter table public.test_plans drop constraint test_plans_athlete_id_fkey;
alter table public.test_plans add constraint test_plans_athlete_id_fkey foreign key (athlete_id) references public.athletes(id) on delete cascade;

alter table public.athlete_invitations drop constraint athlete_invitations_athlete_id_fkey;
alter table public.athlete_invitations add constraint athlete_invitations_athlete_id_fkey foreign key (athlete_id) references public.athletes(id) on delete cascade;

begin;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  constraint messages_relationship_fkey
    foreign key (coach_id, athlete_id)
    references public.coach_athletes(coach_id, athlete_id)
    on delete cascade
);

create index messages_thread_created_idx
  on public.messages (coach_id, athlete_id, created_at, id);

create index messages_unread_idx
  on public.messages (coach_id, athlete_id, created_at)
  where read_at is null;

alter table public.messages enable row level security;

create policy messages_select_participants
on public.messages for select
to authenticated
using (
  (
    coach_id = (select auth.uid())
    and private.is_coach_of(athlete_id)
  )
  or (
    athlete_id = private.current_athlete_id()
    and private.is_athlete_of(coach_id)
  )
);

create policy messages_insert_participants
on public.messages for insert
to authenticated
with check (
  sender_user_id = (select auth.uid())
  and (
    (
      coach_id = (select auth.uid())
      and private.is_coach_of(athlete_id)
    )
    or (
      athlete_id = private.current_athlete_id()
      and private.is_athlete_of(coach_id)
    )
  )
);

create policy messages_mark_received_read
on public.messages for update
to authenticated
using (
  sender_user_id <> (select auth.uid())
  and (
    (
      coach_id = (select auth.uid())
      and private.is_coach_of(athlete_id)
    )
    or (
      athlete_id = private.current_athlete_id()
      and private.is_athlete_of(coach_id)
    )
  )
)
with check (
  sender_user_id <> (select auth.uid())
  and (
    (
      coach_id = (select auth.uid())
      and private.is_coach_of(athlete_id)
    )
    or (
      athlete_id = private.current_athlete_id()
      and private.is_athlete_of(coach_id)
    )
  )
);

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (coach_id, athlete_id, sender_user_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

alter publication supabase_realtime add table public.messages;

commit;

-- Keep coach invitation pending until the athlete actually completes onboarding.
-- Also support legacy invitations that were accepted too early by handle_new_user.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
begin
  insert into public.profiles(
    id,
    full_name,
    avatar_url,
    role
  )
  values(
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url',
    'athlete'
  )
  on conflict (id) do nothing;

  select athlete.id
    into v_athlete
  from public.athletes as athlete
  where athlete.user_id is null
    and lower(btrim(athlete.email)) =
        lower(new.email)
  order by athlete.created_at
  limit 1
  for update;

  if v_athlete is null then
    insert into public.athletes(
      id,
      first_name,
      last_name,
      email,
      user_id
    )
    values(
      new.id,
      coalesce(
        nullif(
          new.raw_user_meta_data->>'first_name',
          ''
        ),
        'Atleta'
      ),
      coalesce(
        nullif(
          new.raw_user_meta_data->>'last_name',
          ''
        ),
        'Climbing Coach'
      ),
      lower(new.email),
      new.id
    )
    returning id into v_athlete;
  else
    update public.athletes
    set user_id = new.id
    where id = v_athlete;
  end if;

  update public.athlete_invitations
  set athlete_id =
    coalesce(
      athlete_id,
      v_athlete
    )
  where email_normalized =
      lower(new.email)
    and status = 'pending'
    and (
      athlete_id is null
      or athlete_id = v_athlete
    );

  return new;
end;
$$;

drop policy if exists
  athlete_invitations_update_related
on public.athlete_invitations;

create policy
  athlete_invitations_update_related
on public.athlete_invitations
for update
using (
  (
    coach_id = (
      select auth.uid()
    )
    and private.current_user_is_coach()
  )
  or
  (
    email_normalized =
      lower(
        coalesce(
          (
            select auth.jwt()
          ) ->> 'email',
          ''
        )
      )
    and status in (
      'pending',
      'accepted'
    )
    and (
      athlete_id is null
      or athlete_id =
        private.current_athlete_id()
    )
  )
)
with check (
  (
    coach_id = (
      select auth.uid()
    )
    and private.current_user_is_coach()
  )
  or
  (
    email_normalized =
      lower(
        coalesce(
          (
            select auth.jwt()
          ) ->> 'email',
          ''
        )
      )
    and status = 'accepted'
    and athlete_id =
      private.current_athlete_id()
  )
);

create or replace function
public.complete_invited_athlete_onboarding(
  p_full_name text,
  p_birth_date date,
  p_weight_kg numeric,
  p_height_cm numeric
)
returns table (
  athlete_id uuid,
  coach_id uuid,
  completed_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid :=
    (
      select auth.uid()
    );

  v_email text :=
    lower(
      coalesce(
        (
          select auth.jwt()
        ) ->> 'email',
        ''
      )
    );

  v_athlete_id uuid :=
    private.current_athlete_id();

  v_name text :=
    btrim(p_full_name);

  v_first_name text;
  v_last_name text;
  v_invitation_id uuid;
  v_coach_id uuid;

  v_completed_at timestamptz :=
    now();
begin
  if
    v_user_id is null
    or v_email = ''
  then
    raise exception
      'Sessione autenticata non valida';
  end if;

  if v_athlete_id is null then
    raise exception
      'Identita atleta non disponibile';
  end if;

  if
    length(v_name) < 3
    or length(v_name) > 120
    or strpos(v_name, ' ') = 0
  then
    raise exception
      'Inserisci nome e cognome';
  end if;

  if
    p_birth_date <
      date '1900-01-01'
    or p_birth_date >
      current_date
  then
    raise exception
      'Data di nascita non valida';
  end if;

  if
    p_weight_kg < 10
    or p_weight_kg > 400
    or p_height_cm < 50
    or p_height_cm > 250
  then
    raise exception
      'Dati fisici non validi';
  end if;

  select
    invitation.id,
    invitation.coach_id
  into
    v_invitation_id,
    v_coach_id
  from public.athlete_invitations
    as invitation
  where
    invitation.email_normalized =
      v_email
    and invitation.status in (
      'pending',
      'accepted'
    )
    and (
      invitation.athlete_id is null
      or invitation.athlete_id =
        v_athlete_id
    )
  order by
    case
      when invitation.status =
        'pending'
      then 0
      else 1
    end,
    invitation.invited_at desc
  limit 1
  for update;

  if v_invitation_id is null then
    raise exception
      'Nessun invito valido per questo indirizzo';
  end if;

  v_first_name :=
    split_part(
      v_name,
      ' ',
      1
    );

  v_last_name :=
    btrim(
      substr(
        v_name,
        length(v_first_name) + 1
      )
    );

  update public.profiles
  set
    full_name =
      v_name,
    first_name =
      v_first_name,
    last_name =
      v_last_name,
    birth_date =
      p_birth_date,
    weight_kg =
      p_weight_kg,
    height_cm =
      p_height_cm,
    onboarding_completed_at =
      v_completed_at,
    must_change_password =
      true
  where id =
    v_user_id;

  if not found then
    raise exception
      'Profilo atleta non trovato';
  end if;

  update public.athlete_invitations
  set
    status =
      'accepted',
    athlete_id =
      v_athlete_id,
    accepted_at =
      coalesce(
        accepted_at,
        v_completed_at
      )
  where id =
    v_invitation_id;

  return query
    select
      v_athlete_id,
      v_coach_id,
      v_completed_at;
end;
$$;

revoke all on function
  public.complete_invited_athlete_onboarding(
    text,
    date,
    numeric,
    numeric
  )
from public, anon;

grant execute on function
  public.complete_invited_athlete_onboarding(
    text,
    date,
    numeric,
    numeric
  )
to authenticated;

comment on function
  public.complete_invited_athlete_onboarding(
    text,
    date,
    numeric,
    numeric
  )
is
  'Completes invited athlete onboarding using the athlete identity linked to auth.uid().';

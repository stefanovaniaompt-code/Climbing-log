-- Repository-only reconstruction of the effective invitation state audited in
-- production on 2026-09-13. Production already contains these definitions
-- through migrations 20260912123630..20260913062021: do not reapply there as
-- part of this one-time realignment.
--
-- The incident-specific row reconciliation is intentionally absent: it was a
-- one-off production data repair and no stable UUID or user data belongs in a
-- forward migration.

create or replace function public.get_invited_athlete_onboarding_context()
returns table(display_name text)
language sql
stable
set search_path = ''
as $$
  select
    btrim(
      concat_ws(
        ' ',
        athlete.first_name,
        athlete.last_name
      )
    ) as display_name
  from public.athlete_invitations
    as invitation
  join public.athletes as athlete
    on athlete.id = invitation.athlete_id
  where
    (select auth.uid()) is not null
    and invitation.email_normalized =
      lower(
        coalesce(
          (select auth.jwt()) ->> 'email',
          ''
        )
      )
    and invitation.status in (
      'pending',
      'accepted'
    )
    and (
      athlete.user_id is null
      or athlete.user_id =
        (select auth.uid())
    )
  order by
    case
      when invitation.status = 'pending'
      then 0
      else 1
    end,
    invitation.invited_at desc
  limit 1;
$$;

revoke all on function
  public.get_invited_athlete_onboarding_context()
  from public, anon;
grant execute on function
  public.get_invited_athlete_onboarding_context()
  to authenticated, service_role;

drop policy if exists
  athlete_invitations_update_related
  on public.athlete_invitations;

create policy athlete_invitations_update_related
on public.athlete_invitations
for update
using (
  (
    coach_id = (select auth.uid())
    and private.current_user_is_coach()
  )
  or (
    email_normalized = lower(
      coalesce(
        (select auth.jwt()) ->> 'email',
        ''
      )
    )
    and status in ('pending', 'accepted')
    and (
      athlete_id is null
      or athlete_id = private.current_athlete_id()
    )
  )
)
with check (
  (
    coach_id = (select auth.uid())
    and private.current_user_is_coach()
  )
  or (
    email_normalized = lower(
      coalesce(
        (select auth.jwt()) ->> 'email',
        ''
      )
    )
    and status = 'accepted'
    and athlete_id = private.current_athlete_id()
  )
);

create or replace function public.complete_invited_athlete_onboarding(
  p_full_name text,
  p_birth_date date,
  p_weight_kg numeric,
  p_height_cm numeric
)
returns table(
  athlete_id uuid,
  coach_id uuid,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid :=
    (select auth.uid());

  v_email text :=
    lower(
      coalesce(
        (select auth.jwt()) ->> 'email',
        ''
      )
    );

  v_athlete_id uuid;
  v_invited_athlete_id uuid;
  v_invited_user_id uuid;
  v_invited_name text;
  v_invitation_id uuid;
  v_coach_id uuid;

  v_name text;
  v_first_name text;
  v_last_name text;

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

  select athlete.id
    into v_athlete_id
  from public.athletes as athlete
  where athlete.user_id = v_user_id
  limit 1
  for update;

  if v_athlete_id is null then
    raise exception
      'Identita atleta non disponibile';
  end if;

  select
    invitation.id,
    invitation.coach_id,
    invited.id,
    invited.user_id,
    btrim(
      concat_ws(
        ' ',
        invited.first_name,
        invited.last_name
      )
    )
  into
    v_invitation_id,
    v_coach_id,
    v_invited_athlete_id,
    v_invited_user_id,
    v_invited_name
  from public.athlete_invitations
    as invitation
  join public.athletes as invited
    on invited.id = invitation.athlete_id
  where
    invitation.email_normalized =
      v_email
    and invitation.status in (
      'pending',
      'accepted'
    )
    and (
      invited.user_id is null
      or invited.user_id =
        v_user_id
    )
  order by
    case
      when invitation.status = 'pending'
      then 0
      else 1
    end,
    invitation.invited_at desc
  limit 1
  for update of invitation, invited;

  if v_invitation_id is null then
    raise exception
      'Nessun invito valido per questo indirizzo';
  end if;

  if
    v_invited_user_id is not null
    and v_invited_user_id <> v_user_id
  then
    raise exception
      'Invito associato a un altro account';
  end if;

  v_name :=
    coalesce(
      nullif(btrim(p_full_name), ''),
      nullif(v_invited_name, '')
    );

  if
    v_name is null
    or length(v_name) < 3
    or length(v_name) > 120
    or strpos(v_name, ' ') = 0
  then
    raise exception
      'Inserisci nome e cognome';
  end if;

  if
    p_birth_date is null
    or p_birth_date < date '1900-01-01'
    or p_birth_date > current_date
  then
    raise exception
      'Data di nascita non valida';
  end if;

  if
    p_weight_kg is null
    or p_weight_kg < 10
    or p_weight_kg > 400
    or p_height_cm is null
    or p_height_cm < 50
    or p_height_cm > 250
  then
    raise exception
      'Dati fisici non validi';
  end if;

  v_first_name :=
    split_part(v_name, ' ', 1);

  v_last_name :=
    btrim(
      substr(
        v_name,
        length(v_first_name) + 1
      )
    );

  if v_invited_athlete_id <> v_athlete_id then
    update public.programs as program
    set athlete_id = v_athlete_id
    where program.athlete_id = v_invited_athlete_id
      and program.coach_id = v_coach_id;

    update public.test_plans as plan
    set athlete_id = v_athlete_id
    where plan.athlete_id = v_invited_athlete_id
      and plan.coach_id = v_coach_id;

    update public.test_sessions as test_session
    set athlete_id = v_athlete_id
    where test_session.athlete_id = v_invited_athlete_id
      and test_session.coach_id = v_coach_id;

    insert into public.coach_athletes(
      coach_id,
      athlete_id,
      status
    )
    values(
      v_coach_id,
      v_athlete_id,
      'active'
    )
    on conflict on constraint coach_athletes_pkey
    do update set status = 'active';

    delete from public.coach_athletes as relationship
    where relationship.coach_id = v_coach_id
      and relationship.athlete_id = v_invited_athlete_id;
  else
    insert into public.coach_athletes(
      coach_id,
      athlete_id,
      status
    )
    values(
      v_coach_id,
      v_athlete_id,
      'active'
    )
    on conflict on constraint coach_athletes_pkey
    do update set status = 'active';
  end if;

  update public.athletes
  set
    first_name = v_first_name,
    last_name = v_last_name,
    email = v_email
  where id = v_athlete_id;

  update public.profiles
  set
    full_name = v_name,
    first_name = v_first_name,
    last_name = v_last_name,
    birth_date = p_birth_date,
    weight_kg = p_weight_kg,
    height_cm = p_height_cm,
    onboarding_completed_at = v_completed_at,
    must_change_password = true
  where id = v_user_id;

  if not found then
    raise exception
      'Profilo atleta non trovato';
  end if;

  update public.athlete_invitations
  set
    status = 'accepted',
    athlete_id = v_athlete_id,
    accepted_at = coalesce(
      accepted_at,
      v_completed_at
    )
  where id = v_invitation_id;

  if v_invited_athlete_id <> v_athlete_id
    and not exists (
      select 1
      from public.coach_athletes as relationship
      where relationship.athlete_id = v_invited_athlete_id
    )
    and not exists (
      select 1
      from public.programs as program
      where program.athlete_id = v_invited_athlete_id
    )
    and not exists (
      select 1
      from public.session_logs as session_log
      where session_log.athlete_id = v_invited_athlete_id
    )
    and not exists (
      select 1
      from public.exercise_logs as exercise_log
      where exercise_log.athlete_id = v_invited_athlete_id
    )
    and not exists (
      select 1
      from public.test_sessions as test_session
      where test_session.athlete_id = v_invited_athlete_id
    )
    and not exists (
      select 1
      from public.test_plans as plan
      where plan.athlete_id = v_invited_athlete_id
    )
    and not exists (
      select 1
      from public.coach_link_requests as link_request
      where link_request.athlete_id = v_invited_athlete_id
    )
    and not exists (
      select 1
      from public.athlete_invitations as invitation
      where invitation.athlete_id = v_invited_athlete_id
    )
  then
    delete from public.athletes
    where id = v_invited_athlete_id
      and user_id is null;
  end if;

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
  to authenticated, service_role;

create or replace function public.create_managed_athlete(
  p_first_name text,
  p_last_name text,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_coach_id uuid := (select auth.uid());
begin
  if not private.current_user_is_coach() then
    raise exception 'Operazione riservata al coach';
  end if;

  if length(btrim(p_first_name)) not between 1 and 80
     or length(btrim(p_last_name)) not between 1 and 80 then
    raise exception 'Nome e cognome sono obbligatori';
  end if;

  if v_email is not null
     and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email non valida';
  end if;

  if v_email is not null then
    select athlete.id
      into v_id
    from public.athlete_invitations as invitation
    join public.athletes as athlete
      on athlete.id = invitation.athlete_id
    where invitation.coach_id = v_coach_id
      and invitation.email_normalized = v_email
      and invitation.status = 'pending'
      and athlete.user_id is null
    order by invitation.invited_at desc
    limit 1
    for update of invitation, athlete;

    if v_id is null then
      select athlete.id
        into v_id
      from public.athletes as athlete
      join public.coach_athletes as relationship
        on relationship.athlete_id = athlete.id
       and relationship.coach_id = v_coach_id
      where athlete.user_id is null
        and lower(btrim(athlete.email)) = v_email
      order by
        case when relationship.status = 'active' then 0 else 1 end,
        athlete.created_at desc
      limit 1
      for update of athlete;
    end if;

    if v_id is not null then
      update public.athletes
      set
        first_name = btrim(p_first_name),
        last_name = btrim(p_last_name),
        email = v_email,
        updated_at = now()
      where id = v_id;

      insert into public.coach_athletes(
        coach_id,
        athlete_id,
        status
      )
      values(v_coach_id, v_id, 'active')
      on conflict on constraint coach_athletes_pkey
      do update set status = 'active';

      return v_id;
    end if;
  end if;

  insert into public.athletes(
    first_name,
    last_name,
    email
  )
  values(
    btrim(p_first_name),
    btrim(p_last_name),
    v_email
  )
  returning id into v_id;

  insert into public.coach_athletes(
    coach_id,
    athlete_id,
    status
  )
  values(v_coach_id, v_id, 'active');

  return v_id;
end;
$$;

revoke all on function
  public.create_managed_athlete(text, text, text)
  from public, anon;
grant execute on function
  public.create_managed_athlete(text, text, text)
  to authenticated, service_role;

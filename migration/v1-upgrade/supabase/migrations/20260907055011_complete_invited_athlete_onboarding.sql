-- Completa in una sola transazione l'onboarding di un atleta invitato.
-- SECURITY INVOKER mantiene attive le policy RLS di profiles e athlete_invitations.
create or replace function public.complete_invited_athlete_onboarding(
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
  v_user_id uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_name text := btrim(p_full_name);
  v_first_name text;
  v_last_name text;
  v_invitation_id uuid;
  v_coach_id uuid;
  v_completed_at timestamptz := now();
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Sessione autenticata non valida';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 or strpos(v_name, ' ') = 0 then
    raise exception 'Inserisci nome e cognome';
  end if;
  if p_birth_date < date '1900-01-01' or p_birth_date > current_date then
    raise exception 'Data di nascita non valida';
  end if;
  if p_weight_kg < 10 or p_weight_kg > 400 or p_height_cm < 50 or p_height_cm > 250 then
    raise exception 'Dati fisici non validi';
  end if;

  select invitation.id, invitation.coach_id
    into v_invitation_id, v_coach_id
  from public.athlete_invitations as invitation
  where invitation.email_normalized = v_email
    and invitation.status = 'pending'
  order by invitation.invited_at desc
  limit 1
  for update;

  if v_invitation_id is null then
    raise exception 'Nessun invito attivo per questo indirizzo';
  end if;

  v_first_name := split_part(v_name, ' ', 1);
  v_last_name := btrim(substr(v_name, length(v_first_name) + 1));

  update public.profiles
  set full_name = v_name,
      first_name = v_first_name,
      last_name = v_last_name,
      birth_date = p_birth_date,
      weight_kg = p_weight_kg,
      height_cm = p_height_cm,
      onboarding_completed_at = v_completed_at
  where id = v_user_id;

  if not found then
    raise exception 'Profilo atleta non trovato';
  end if;

  update public.athlete_invitations
  set status = 'accepted',
      athlete_id = v_user_id,
      accepted_at = v_completed_at
  where id = v_invitation_id;

  return query select v_user_id, v_coach_id, v_completed_at;
end;
$$;

revoke all on function public.complete_invited_athlete_onboarding(text, date, numeric, numeric) from public, anon;
grant execute on function public.complete_invited_athlete_onboarding(text, date, numeric, numeric) to authenticated;

comment on function public.complete_invited_athlete_onboarding(text, date, numeric, numeric) is
  'Onboarding atomico per atleta invitato; usa auth.uid, email JWT e policy RLS esistenti.';

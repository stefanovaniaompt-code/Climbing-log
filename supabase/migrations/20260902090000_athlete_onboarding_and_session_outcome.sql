-- Climbing Coach - onboarding atleta e risultato finale della sessione.
-- Migration additiva: preserva profili, programmi, test e log esistenti.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists weight_kg numeric,
  add column if not exists height_cm numeric,
  add column if not exists onboarding_completed_at timestamptz;

-- I profili già presenti precedono l'onboarding obbligatorio. Vengono marcati come
-- completati senza perdere full_name; potranno correggere i campi dal proprio profilo.
update public.profiles
set first_name = coalesce(
      nullif(btrim(first_name), ''),
      nullif(split_part(btrim(full_name), ' ', 1), ''),
      'Profilo'
    ),
    last_name = coalesce(
      nullif(btrim(last_name), ''),
      nullif(btrim(regexp_replace(coalesce(full_name, ''), '^\S+\s*', '')), ''),
      'Da completare'
    ),
    onboarding_completed_at = coalesce(onboarding_completed_at, created_at, now())
where onboarding_completed_at is null;

alter table public.profiles
  drop constraint if exists profiles_birth_date_valid,
  add constraint profiles_birth_date_valid
    check (birth_date is null or (birth_date >= date '1900-01-01' and birth_date <= current_date)),
  drop constraint if exists profiles_weight_kg_valid,
  add constraint profiles_weight_kg_valid
    check (weight_kg is null or (weight_kg >= 10 and weight_kg <= 400)),
  drop constraint if exists profiles_height_cm_valid,
  add constraint profiles_height_cm_valid
    check (height_cm is null or (height_cm >= 50 and height_cm <= 250)),
  drop constraint if exists profiles_onboarding_data_complete,
  add constraint profiles_onboarding_data_complete
    check (
      onboarding_completed_at is null
      or (
        nullif(btrim(first_name), '') is not null
        and nullif(btrim(last_name), '') is not null
        and birth_date is not null
        and weight_kg is not null
        and height_cm is not null
      )
    ) not valid;

-- I profili storici restano validi anche se non hanno ancora tutti i nuovi dati.
-- Ogni nuovo salvataggio che imposta onboarding_completed_at viene invece validato.

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant update (
  full_name,
  avatar_url,
  first_name,
  last_name,
  birth_date,
  weight_kg,
  height_cm,
  onboarding_completed_at
) on public.profiles to authenticated;

-- profiles_select_related e profiles_update_self esistenti continuano a limitare
-- rispettivamente lettura a sé/coach attivo e modifica al solo proprietario.

alter table public.session_logs
  add column if not exists completion_outcome text,
  add column if not exists autosaved_at timestamptz;

alter table public.session_logs
  drop constraint if exists session_logs_completion_outcome_valid,
  add constraint session_logs_completion_outcome_valid
    check (completion_outcome is null or completion_outcome in ('completed', 'partial')),
  drop constraint if exists session_logs_completed_state_valid,
  add constraint session_logs_completed_state_valid
    check (
      status <> 'completed'
      or (
        completed_at is not null
        and completion_outcome in ('completed', 'partial')
      )
    ) not valid;

revoke all on public.session_logs from anon;
grant select, insert, update, delete on public.session_logs to authenticated;

create index if not exists session_exercises_exercise_id_idx
  on public.session_exercises(exercise_id);

comment on column public.profiles.onboarding_completed_at is
  'Istante in cui l atleta ha completato i dati obbligatori del profilo.';
comment on column public.session_logs.completion_outcome is
  'Esito dichiarato: completed se tutto eseguito, partial se uno o più esercizi sono stati saltati.';
comment on column public.session_logs.autosaved_at is
  'Ultimo autosalvataggio della bozza cloud; non implica completamento.';

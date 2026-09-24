begin;

alter table public.programs
  add column program_type text not null default 'athlete';

alter table public.programs
  add constraint programs_program_type_valid
    check (program_type in ('athlete', 'patient'));

alter table public.session_logs
  add column pain_present boolean,
  add column pain_vas smallint,
  add column pain_exercise_id uuid,
  add column pain_persists_post_session boolean,
  add column feedback_submitted_at timestamptz,
  add column feedback_updated_at timestamptz;

alter table public.session_logs
  add constraint session_logs_pain_vas_valid
    check (pain_vas is null or pain_vas between 1 and 10),
  add constraint session_logs_pain_exercise_id_fkey
    foreign key (pain_exercise_id)
    references public.session_exercises(id)
    on delete set null;

alter table public.session_logs
  drop constraint session_logs_completion_outcome_valid,
  add constraint session_logs_completion_outcome_valid
    check (
      completion_outcome is null
      or completion_outcome in ('completed', 'partial', 'not_completed')
    );

alter table public.session_logs
  drop constraint session_logs_completed_state_valid,
  add constraint session_logs_completed_state_valid
    check (
      status <> 'completed'
      or (
        completed_at is not null
        and completion_outcome in ('completed', 'partial', 'not_completed')
      )
    ) not valid;

alter table public.session_logs
  validate constraint session_logs_completed_state_valid;

comment on column public.programs.program_type is
  'Tipo di percorso: athlete per allenamento, patient per percorso clinico.';
comment on column public.session_logs.feedback_submitted_at is
  'Primo invio del feedback di fine sessione; resta invariato nelle modifiche.';
comment on column public.session_logs.feedback_updated_at is
  'Ultima modifica del feedback successiva al primo invio.';

commit;

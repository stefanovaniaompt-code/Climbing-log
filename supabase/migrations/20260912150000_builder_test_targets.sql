alter table public.exercise_test_targets
  add column if not exists source_metric_label text,
  add column if not exists source_protocol_key text,
  add column if not exists source_protocol_version text,
  add column if not exists source_setup jsonb not null default '{}'::jsonb,
  add column if not exists source_measurement_source text,
  add column if not exists source_quality_status text,
  add column if not exists source_measured_at timestamptz,
  add column if not exists set_targets jsonb;

update public.exercise_test_targets
set
  source_metric_label =
    coalesce(
      source_metric_label,
      metric_key
    ),

  source_measured_at =
    coalesce(
      source_measured_at,
      source_tested_at::timestamptz
    ),

  source_quality_status =
    coalesce(
      source_quality_status,
      'VALID'
    ),

  source_measurement_source =
    coalesce(
      source_measurement_source,
      'manual'
    ),

  set_targets =
    coalesce(
      set_targets,
      jsonb_build_array(
        jsonb_build_object(
          'setNumber',
          1,

          'percentage',
          percentage,

          'calculatedTarget',
          calculated_target,

          'targetUnit',
          target_unit
        )
      )
    );

alter table public.exercise_test_targets
  alter column set_targets
  set not null;

alter table public.exercise_test_targets
  drop constraint if exists
  exercise_test_targets_quality_check;

alter table public.exercise_test_targets
  add constraint
  exercise_test_targets_quality_check
  check (
    source_quality_status is null
    or source_quality_status in (
      'VALID',
      'REVIEW',
      'INVALID'
    )
  )
  not valid;

alter table public.exercise_test_targets
  validate constraint
  exercise_test_targets_quality_check;

alter table public.exercise_test_targets
  drop constraint if exists
  exercise_test_targets_set_targets_check;

alter table public.exercise_test_targets
  add constraint
  exercise_test_targets_set_targets_check
  check (
    jsonb_typeof(set_targets) =
      'array'
    and
    jsonb_array_length(
      set_targets
    ) > 0
  )
  not valid;

alter table public.exercise_test_targets
  validate constraint
  exercise_test_targets_set_targets_check;

create index if not exists
  exercise_test_targets_metric_snapshot_idx
on public.exercise_test_targets (
  metric_key,
  source_protocol_key,
  source_protocol_version,
  source_measured_at
);

comment on column
  public.exercise_test_targets.set_targets
is
  'Immutable per-set prescription snapshot calculated from the selected test result.';

comment on column
  public.exercise_test_targets.source_value
is
  'Snapshot of the source result value. It does not change after a retest.';

-- Materialize canonical results from the explicitly selected Tindeq attempt.
--
-- Selection and official-result replacement happen inside one transaction.
-- The metric values supplied by the client must match values already stored
-- on the immutable acquisition attempt.

create unique index if not exists
  test_results_attempt_metric_idx
on public.test_results (
  attempt_id,
  metric_key
)
where attempt_id is not null;

revoke execute
on function public.select_test_attempt(uuid, uuid)
from authenticated;

create or replace function public.materialize_test_attempt_results(
  p_test_session_item_id uuid,
  p_attempt_id uuid,
  p_setup jsonb,
  p_metrics jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_attempt record;
  metric jsonb;
  metric_key text;
  metric_label text;
  metric_unit text;
  metric_value double precision;
  expected_value double precision;
  metric_is_primary boolean;
  metric_normalize_bw boolean;
  primary_count integer;
begin
  if p_test_session_item_id is null then
    raise exception
      'Test session item is required.';
  end if;

  if p_attempt_id is null then
    raise exception
      'Attempt is required.';
  end if;

  if p_setup is null
     or jsonb_typeof(p_setup) <> 'object' then
    raise exception
      'Test setup must be a JSON object.';
  end if;

  if p_metrics is null
     or jsonb_typeof(p_metrics) <> 'array' then
    raise exception
      'Canonical metrics must be a JSON array.';
  end if;

  -- Serializes competing selections for the same test item.
  perform 1
  from public.test_session_items tsi
  where tsi.id = p_test_session_item_id
  for update;

  if not found then
    raise exception
      'Test session item not found or not accessible.';
  end if;

  select
    ta.test_session_id,
    ta.quality_status,
    ta.primary_metric_key,
    ta.primary_value,
    ta.primary_unit,
    ta.secondary_metrics,
    ta.side,
    ta.grip,
    ta.protocol_key,
    ta.protocol_version,
    ta.raw_curve_path,
    ta.body_weight_kg_at_test
  into target_attempt
  from public.test_attempts ta
  where
    ta.id = p_attempt_id
    and ta.test_session_item_id =
      p_test_session_item_id
  for update;

  if not found then
    raise exception
      'Attempt not found in the selected test item.';
  end if;

  if target_attempt.quality_status = 'INVALID' then
    raise exception
      'Invalid attempts cannot be selected.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_metrics) element
    group by element ->> 'metricKey'
    having count(*) > 1
  ) then
    raise exception
      'Canonical metric keys must be unique.';
  end if;

  primary_count := 0;

  for metric in
    select value
    from jsonb_array_elements(p_metrics)
  loop
    if jsonb_typeof(metric) <> 'object' then
      raise exception
        'Each canonical metric must be an object.';
    end if;

    metric_key :=
      nullif(
        trim(metric ->> 'metricKey'),
        ''
      );

    metric_label :=
      nullif(
        trim(metric ->> 'metricLabel'),
        ''
      );

    metric_unit :=
      nullif(
        trim(metric ->> 'unit'),
        ''
      );

    if metric_key is null then
      raise exception
        'Canonical metric key is required.';
    end if;

    if metric_label is null then
      raise exception
        'Canonical metric label is required.';
    end if;

    if metric_unit is null then
      raise exception
        'Canonical metric unit is required.';
    end if;

    if jsonb_typeof(metric -> 'value') <> 'number' then
      raise exception
        'Canonical metric value must be numeric.';
    end if;

    if jsonb_typeof(metric -> 'isPrimary') <> 'boolean' then
      raise exception
        'Canonical isPrimary must be boolean.';
    end if;

    if jsonb_typeof(
      metric -> 'normalizeToBodyWeight'
    ) <> 'boolean' then
      raise exception
        'Canonical normalizeToBodyWeight must be boolean.';
    end if;

    metric_value :=
      (metric ->> 'value')::double precision;

    metric_is_primary :=
      (metric ->> 'isPrimary')::boolean;

    metric_normalize_bw :=
      (metric ->> 'normalizeToBodyWeight')::boolean;

    if metric_key =
       target_attempt.primary_metric_key then
      expected_value :=
        target_attempt.primary_value;
    elsif
      target_attempt.secondary_metrics
        ? metric_key
    then
      expected_value :=
        (
          target_attempt.secondary_metrics
            ->> metric_key
        )::double precision;
    else
      raise exception
        'Metric % is not stored on the selected attempt.',
        metric_key;
    end if;

    if expected_value is null then
      raise exception
        'Metric % has no stored value on the selected attempt.',
        metric_key;
    end if;

    if abs(
      expected_value -
      metric_value
    ) >
      greatest(
        0.000000001,
        abs(expected_value)
          * 0.000000001
      )
    then
      raise exception
        'Metric % does not match the stored attempt value.',
        metric_key;
    end if;

    if metric_is_primary then
      primary_count :=
        primary_count + 1;

      if
        target_attempt.primary_metric_key is null
        or metric_key <>
          target_attempt.primary_metric_key
      then
        raise exception
          'Primary canonical metric does not match the attempt primary metric.';
      end if;

      if
        target_attempt.primary_unit is not null
        and lower(metric_unit) <>
          lower(target_attempt.primary_unit)
      then
        raise exception
          'Primary canonical metric unit does not match the attempt unit.';
      end if;
    end if;
  end loop;

  if
    target_attempt.primary_metric_key is not null
    and target_attempt.primary_value is not null
  then
    if primary_count <> 1 then
      raise exception
        'Exactly one canonical primary metric is required.';
    end if;
  elsif primary_count <> 0 then
    raise exception
      'This attempt does not define a primary metric.';
  end if;

  -- Explicit selection. The partial unique index added in Push 1
  -- remains the final database invariant.
  update public.test_attempts
  set is_selected = false
  where
    test_session_item_id =
      p_test_session_item_id
    and id <> p_attempt_id
    and is_selected = true;

  update public.test_attempts
  set is_selected = true
  where
    id = p_attempt_id
    and test_session_item_id =
      p_test_session_item_id;

  -- Remove only official Tindeq results belonging to this same item.
  -- Results from other items and previous test sessions are untouched.
  delete from public.test_results tr
  using public.test_attempts ta
  where
    tr.attempt_id = ta.id
    and ta.test_session_item_id =
      p_test_session_item_id
    and tr.measurement_source =
      'tindeq';

  insert into public.test_results (
    id,
    test_session_id,
    attempt_id,
    metric_key,
    metric_label,
    value,
    unit,
    side,
    grip,
    normalize_to_body_weight,
    setup,
    measurement_source,
    quality_status,
    is_primary,
    protocol_key,
    protocol_version,
    secondary_metrics,
    raw_curve_path,
    body_weight_kg_at_test
  )
  select
    gen_random_uuid(),
    target_attempt.test_session_id,
    p_attempt_id,
    element ->> 'metricKey',
    element ->> 'metricLabel',
    (element ->> 'value')::double precision,
    element ->> 'unit',
    target_attempt.side,
    target_attempt.grip,
    (element ->> 'normalizeToBodyWeight')::boolean,
    p_setup,
    'tindeq',
    target_attempt.quality_status,
    (element ->> 'isPrimary')::boolean,
    target_attempt.protocol_key,
    target_attempt.protocol_version,
    target_attempt.secondary_metrics,
    target_attempt.raw_curve_path,
    target_attempt.body_weight_kg_at_test
  from jsonb_array_elements(p_metrics) element;
end;
$$;

revoke all
on function public.materialize_test_attempt_results(
  uuid,
  uuid,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.materialize_test_attempt_results(
  uuid,
  uuid,
  jsonb,
  jsonb
)
to authenticated;

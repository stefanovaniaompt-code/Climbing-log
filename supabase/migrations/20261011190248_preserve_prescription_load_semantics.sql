-- Preserve the historical JSON representation while scaling only values that
-- can be identified as kilogram loads. No existing prescription is rewritten
-- by this migration; the functions run only after an explicit coach action.
create or replace function private.scale_load_values_report(value jsonb, factor numeric)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  item jsonb;
  child_report jsonb;
  scaled_item jsonb;
  result jsonb;
  numeric_text text;
  normalized_unit text;
  normalized_load_type text;
  updated_count integer := 0;
  unscalable_count integer := 0;
begin
  if jsonb_typeof(value) = 'array' then
    result := '[]'::jsonb;
    for item in select jsonb_array_elements(value) loop
      child_report := private.scale_load_values_report(item, factor);
      result := result || jsonb_build_array(child_report -> 'value');
      updated_count := updated_count + (child_report ->> 'updated')::integer;
      unscalable_count := unscalable_count + (child_report ->> 'unscalable')::integer;
    end loop;
    return jsonb_build_object('value', result, 'updated', updated_count, 'unscalable', unscalable_count);
  end if;

  if jsonb_typeof(value) <> 'object' then
    return jsonb_build_object('value', value, 'updated', 0, 'unscalable', 0);
  end if;

  normalized_unit := lower(trim(value ->> 'unit'));
  normalized_load_type := regexp_replace(lower(trim(value ->> 'load_type')), '[[:space:]-]+', '_', 'g');

  if normalized_load_type in ('bodyweight', 'body_weight', 'self_weight', 'climbing_grade', 'grade')
    or (normalized_unit is not null and normalized_unit not in ('', 'kg', 'kgs', 'kilogram', 'kilograms', 'chilogrammo', 'chilogrammi')) then
    return jsonb_build_object('value', value, 'updated', 0, 'unscalable', 0);
  end if;

  result := '{}'::jsonb;
  for key, item in select * from jsonb_each(value) loop
    if key in ('loadKg', 'load_kg', 'load_value') and jsonb_typeof(item) = 'number' then
      scaled_item := to_jsonb(round((item #>> '{}')::numeric * factor * 2) / 2);
      result := result || jsonb_build_object(key, scaled_item);
      if scaled_item is distinct from item then updated_count := updated_count + 1; end if;
    elsif key in ('loadKg', 'load_kg', 'load_value') and jsonb_typeof(item) = 'string'
      and (item #>> '{}') ~ '^[[:space:]]*[+-]?([0-9]+([.,][0-9]+)?|[.,][0-9]+)[[:space:]]*$' then
      numeric_text := replace(trim(item #>> '{}'), ',', '.');
      scaled_item := to_jsonb(trim_scale(round(numeric_text::numeric * factor * 2) / 2)::text);
      result := result || jsonb_build_object(key, scaled_item);
      if scaled_item is distinct from item then updated_count := updated_count + 1; end if;
    elsif key in ('loadKg', 'load_kg', 'load_value') and item <> 'null'::jsonb then
      result := result || jsonb_build_object(key, item);
      unscalable_count := unscalable_count + 1;
    elsif key = 'dose' and jsonb_typeof(item) = 'string'
      and (item #>> '{}') ~* '(^|[^[:alpha:]])kg(s)?([^[:alpha:]]|$)' then
      result := result || jsonb_build_object(key, item);
      unscalable_count := unscalable_count + 1;
    else
      child_report := private.scale_load_values_report(item, factor);
      result := result || jsonb_build_object(key, child_report -> 'value');
      updated_count := updated_count + (child_report ->> 'updated')::integer;
      unscalable_count := unscalable_count + (child_report ->> 'unscalable')::integer;
    end if;
  end loop;

  return jsonb_build_object('value', result, 'updated', updated_count, 'unscalable', unscalable_count);
end;
$$;

create or replace function private.scale_load_values(value jsonb, factor numeric)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.scale_load_values_report(value, factor) -> 'value';
$$;

create or replace function private.has_derived_load_context(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  item jsonb;
  normalized_key text;
begin
  if value is null or value in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb) then return false; end if;
  if jsonb_typeof(value) = 'array' then
    for item in select jsonb_array_elements(value) loop
      if private.has_derived_load_context(item) then return true; end if;
    end loop;
    return false;
  end if;
  if jsonb_typeof(value) <> 'object' then return false; end if;

  for key, item in select * from jsonb_each(value) loop
    normalized_key := regexp_replace(lower(key), '[[:space:]-]+', '_', 'g');
    if normalized_key in (
      'percentage_source', 'one_rm_kg', 'one_rm', 'load_basis',
      'test_target', 'test_result_id', 'test_attempt_id', 'source_result_id',
      'source_test_id', 'set_targets', 'calculated_target',
      'calculated_target_kg', 'source_metric_key', 'source_metric_label',
      'reference_type', 'reference_id', 'target_unit'
    ) and item not in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb, '""'::jsonb) then
      return true;
    end if;
    if private.has_derived_load_context(item) then return true; end if;
  end loop;
  return false;
end;
$$;

create or replace function private.prescription_load_adjustment_report(prescription jsonb, calculation_context jsonb, factor numeric)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_load_type text := regexp_replace(lower(trim(prescription ->> 'load_type')), '[[:space:]-]+', '_', 'g');
  normalized_unit text := regexp_replace(lower(trim(prescription ->> 'unit')), '[[:space:]-]+', '_', 'g');
begin
  if private.has_derived_load_context(calculation_context) then
    return jsonb_build_object(
      'value', prescription,
      'updated', 0,
      'unscalable', 1,
      'excluded', true,
      'reason', 'test_derived'
    );
  end if;

  if normalized_load_type in (
      'not_applicable', 'bodyweight', 'body_weight', 'self_weight',
      'climbing_grade', 'grade', 'percentage', 'test_percentage',
      'percentage_of_test', 'percentage_of_one_rm'
    )
    or (normalized_unit is not null and normalized_unit not in ('', 'kg', 'kgs', 'kilogram', 'kilograms', 'chilogrammo', 'chilogrammi')) then
    return jsonb_build_object(
      'value', prescription,
      'updated', 0,
      'unscalable', 1,
      'excluded', true,
      'reason', 'incompatible_load_semantics'
    );
  end if;

  return private.scale_load_values_report(prescription, factor);
end;
$$;

create or replace function public.adjust_prescription_loads_reported(target_scope text, target_id uuid, percentage numeric)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  exercise_row record;
  report jsonb;
  updated_rows integer := 0;
  unscalable_rows integer := 0;
  unchanged_rows integer := 0;
  partial_rows integer := 0;
begin
  if target_scope not in ('week', 'session') then raise exception 'Ambito carichi non valido.'; end if;
  if percentage < -100 or percentage > 500 then raise exception 'Percentuale non valida.'; end if;
  if target_scope = 'week' and not private.can_manage_week(target_id) then raise exception 'Settimana non modificabile.' using errcode = '42501'; end if;
  if target_scope = 'session' and not private.can_manage_session(target_id) then raise exception 'Sessione non modificabile.' using errcode = '42501'; end if;

  for exercise_row in
    select se.id, se.prescription, se.calculation_context
    from public.session_exercises se
    join public.sessions s on s.id = se.session_id
    where (target_scope = 'session' and s.id = target_id)
       or (target_scope = 'week' and s.training_week_id = target_id)
    for update of se
  loop
    report := private.prescription_load_adjustment_report(
      exercise_row.prescription,
      exercise_row.calculation_context,
      1 + percentage / 100
    );
    if (report ->> 'updated')::integer > 0 then
      update public.session_exercises
      set prescription = report -> 'value', updated_at = now()
      where id = exercise_row.id;
      updated_rows := updated_rows + 1;
    end if;
    if (report ->> 'unscalable')::integer > 0 then
      unscalable_rows := unscalable_rows + 1;
      if (report ->> 'updated')::integer > 0 then partial_rows := partial_rows + 1; end if;
    elsif (report ->> 'updated')::integer = 0 then
      unchanged_rows := unchanged_rows + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'updatedRows', updated_rows,
    'unscalableRows', unscalable_rows,
    'unchangedRows', unchanged_rows,
    'partialRows', partial_rows
  );
end;
$$;

-- Keep the established RPC contract for older clients, but return only rows
-- whose persisted JSON was actually changed.
create or replace function public.adjust_prescription_loads(target_scope text, target_id uuid, percentage numeric)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select (public.adjust_prescription_loads_reported(target_scope, target_id, percentage) ->> 'updatedRows')::integer;
$$;

revoke all on function private.scale_load_values_report(jsonb, numeric) from public, anon;
revoke all on function private.scale_load_values(jsonb, numeric) from public, anon;
revoke all on function private.has_derived_load_context(jsonb) from public, anon;
revoke all on function private.prescription_load_adjustment_report(jsonb, jsonb, numeric) from public, anon;
revoke all on function public.adjust_prescription_loads_reported(text, uuid, numeric) from public, anon;
revoke all on function public.adjust_prescription_loads(text, uuid, numeric) from public, anon;
grant execute on function private.scale_load_values_report(jsonb, numeric) to authenticated;
grant execute on function private.scale_load_values(jsonb, numeric) to authenticated;
grant execute on function private.has_derived_load_context(jsonb) to authenticated;
grant execute on function private.prescription_load_adjustment_report(jsonb, jsonb, numeric) to authenticated;
grant execute on function public.adjust_prescription_loads_reported(text, uuid, numeric) to authenticated;
grant execute on function public.adjust_prescription_loads(text, uuid, numeric) to authenticated;

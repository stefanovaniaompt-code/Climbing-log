-- Connect remote assignments to their library template without rewriting any
-- historical session or result. Existing items with test_library_id = null keep
-- their legacy behavior.

drop policy if exists test_library_select on public.test_library;

create policy test_library_select
on public.test_library
for select
to authenticated
using (
  coach_id = (select auth.uid())
  or exists (
    select 1
    from public.test_plan_items tpi
    join public.test_plans tp on tp.id = tpi.test_plan_id
    where tpi.test_library_id = test_library.id
      and tp.athlete_id = private.current_athlete_id()
      and tp.status in ('published', 'completed')
  )
  or exists (
    select 1
    from public.test_session_items tsi
    join public.test_sessions ts on ts.id = tsi.test_session_id
    where tsi.test_library_id = test_library.id
      and ts.mode = 'remote'
      and ts.athlete_id = private.current_athlete_id()
      and ts.status in ('assigned', 'in_progress', 'completed')
  )
);

create or replace function public.save_remote_test_item(
  p_item_id uuid,
  p_values jsonb,
  p_notes text,
  p_status text,
  p_completed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.test_session_items%rowtype;
  v_session public.test_sessions%rowtype;
  v_athlete_id uuid;
  v_value jsonb;
  v_field jsonb;
  v_schema jsonb;
begin
  select * into v_item
  from public.test_session_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'Remote test item not found';
  end if;

  select * into v_session
  from public.test_sessions
  where id = v_item.test_session_id
  for update;

  if v_session.id is null
     or v_session.mode <> 'remote'
     or v_session.status <> 'in_progress' then
    raise exception 'Remote test session is not in progress';
  end if;

  select id into v_athlete_id
  from public.athletes
  where user_id = (select auth.uid())
  limit 1;

  if v_athlete_id is null or v_athlete_id <> v_session.athlete_id then
    raise exception 'Remote test item belongs to another athlete';
  end if;

  if v_item.source <> 'manual' then
    raise exception 'Remote tests must use manual measurement';
  end if;

  if p_status not in ('pending', 'in_progress', 'completed', 'skipped') then
    raise exception 'Invalid remote test item status';
  end if;

  if jsonb_typeof(coalesce(p_values, '[]'::jsonb)) <> 'array' then
    raise exception 'Remote values must be an array';
  end if;

  if v_item.status in ('completed', 'skipped') then
    return jsonb_build_object('id', v_item.id, 'status', v_item.status, 'unchanged', true);
  end if;

  if p_status = 'completed'
     and jsonb_array_length(coalesce(p_values, '[]'::jsonb)) = 0 then
    raise exception 'A completed remote test requires at least one value';
  end if;

  v_schema := v_item.config->'outputSchema';

  for v_value in
    select value from jsonb_array_elements(coalesce(p_values, '[]'::jsonb))
  loop
    if jsonb_typeof(v_value) <> 'object'
       or coalesce(btrim(v_value->>'metricKey'), '') = ''
       or coalesce(btrim(v_value->>'metricLabel'), '') = ''
       or coalesce(btrim(v_value->>'unit'), '') = ''
       or jsonb_typeof(v_value->'value') <> 'number' then
      raise exception 'Invalid remote test metric';
    end if;

    if jsonb_typeof(v_schema) = 'array' then
      select value into v_field
      from jsonb_array_elements(v_schema)
      where value->>'key' = v_value->>'metricKey'
      limit 1;

      if v_field is null then
        raise exception 'Metric is not part of the assigned remote output schema';
      end if;

      if (v_value->>'value')::numeric < coalesce((v_field->>'min')::numeric, 0) then
        raise exception 'Remote test values cannot be below the configured minimum';
      end if;

      if v_field->>'type' = 'integer'
         and mod((v_value->>'value')::numeric, 1) <> 0 then
        raise exception 'Remote repetitions must be integers';
      end if;
    end if;
  end loop;

  if p_status = 'completed' and jsonb_typeof(v_schema) = 'array' then
    for v_field in select value from jsonb_array_elements(v_schema)
    loop
      if coalesce((v_field->>'required')::boolean, false)
         and not exists (
           select 1
           from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) metric
           where metric->>'metricKey' = v_field->>'key'
         ) then
        raise exception 'All required remote results must be completed';
      end if;
    end loop;
  end if;

  update public.test_session_items
  set draft_values = case when p_status = 'skipped' then '[]'::jsonb else coalesce(p_values, '[]'::jsonb) end,
      athlete_notes = coalesce(p_notes, ''),
      status = p_status,
      completed_at = case when p_status = 'completed' then coalesce(p_completed_at, now()) else null end
  where id = p_item_id;

  if p_status <> 'completed' then
    delete from public.test_results
    where test_session_item_id = p_item_id
      and measurement_source = 'manual';

    return jsonb_build_object('id', p_item_id, 'status', p_status);
  end if;

  delete from public.test_results
  where test_session_item_id = p_item_id
    and measurement_source = 'manual';

  insert into public.test_results (
    test_session_id, test_session_item_id, test_library_id,
    metric_key, metric_label, value, unit, side, grip,
    normalize_to_body_weight, setup, notes, measurement_source,
    quality_status, is_primary, protocol_key, protocol_version,
    body_weight_kg_at_test
  )
  select
    v_session.id, v_item.id, v_item.test_library_id,
    btrim(metric->>'metricKey'), btrim(metric->>'metricLabel'),
    (metric->>'value')::double precision, btrim(metric->>'unit'),
    coalesce(nullif(metric->>'side', ''), v_item.side), v_item.grip,
    false, v_item.config, nullif(btrim(coalesce(p_notes, '')), ''),
    'manual', 'VALID',
    btrim(metric->>'metricKey') = nullif(btrim(coalesce(v_item.config->>'primaryMetricKey', '')), ''),
    v_item.protocol_key, v_item.protocol_version, v_session.body_weight_kg
  from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) metric;

  return jsonb_build_object('id', p_item_id, 'status', 'completed');
end;
$$;

revoke all
on function public.save_remote_test_item(uuid, jsonb, text, text, timestamptz)
from public, anon;

grant execute
on function public.save_remote_test_item(uuid, jsonb, text, text, timestamptz)
to authenticated, service_role;

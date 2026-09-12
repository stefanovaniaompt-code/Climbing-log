alter table public.test_results
  add column if not exists measured_at timestamptz;

create or replace function private.set_test_result_measured_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.measured_at is not null then
    return new;
  end if;

  if new.attempt_id is not null then
    select coalesce(
      attempt.ended_at,
      attempt.started_at
    )
    into new.measured_at
    from public.test_attempts attempt
    where attempt.id = new.attempt_id;
  end if;

  if (
    new.measured_at is null
    and new.test_session_item_id is not null
  ) then
    select item.completed_at
    into new.measured_at
    from public.test_session_items item
    where item.id = new.test_session_item_id;
  end if;

  if new.measured_at is null then
    select coalesce(
      session.ended_at,
      session.started_at,
      session.tested_at::timestamptz,
      session.created_at
    )
    into new.measured_at
    from public.test_sessions session
    where session.id = new.test_session_id;
  end if;

  new.measured_at =
    coalesce(
      new.measured_at,
      now()
    );

  return new;
end;
$$;

drop trigger if exists
  test_results_set_measured_at
on public.test_results;

create trigger test_results_set_measured_at
before insert
on public.test_results
for each row
execute function private.set_test_result_measured_at();

update public.test_results result
set measured_at =
  coalesce(
    (
      select coalesce(
        attempt.ended_at,
        attempt.started_at
      )
      from public.test_attempts attempt
      where attempt.id =
        result.attempt_id
    ),
    (
      select item.completed_at
      from public.test_session_items item
      where item.id =
        result.test_session_item_id
    ),
    (
      select coalesce(
        session.ended_at,
        session.started_at,
        session.tested_at::timestamptz,
        session.created_at
      )
      from public.test_sessions session
      where session.id =
        result.test_session_id
    ),
    now()
  )
where result.measured_at is null;

alter table public.test_results
  alter column measured_at
  set not null;

create index if not exists
  test_results_history_measured_at_idx
on public.test_results (
  test_session_id,
  measured_at desc
);

create index if not exists
  test_results_longitudinal_idx
on public.test_results (
  protocol_key,
  protocol_version,
  metric_key,
  side,
  grip,
  measured_at desc
);

-- Tindeq domain foundation.
-- One test session contains multiple items.
-- One item contains multiple attempts.
-- Selection of the official attempt is explicit and atomic.

do $$
begin
  if exists (
    select
      test_session_item_id
    from public.test_attempts
    where
      test_session_item_id is not null
      and is_selected = true
    group by test_session_item_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce one selected attempt per item: duplicate selected attempts exist.';
  end if;
end
$$;

create unique index if not exists
  test_attempts_one_selected_per_item_idx
on public.test_attempts (
  test_session_item_id
)
where
  test_session_item_id is not null
  and is_selected = true;

create or replace function public.select_test_attempt(
  p_test_session_item_id uuid,
  p_attempt_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_quality text;
begin
  if p_test_session_item_id is null then
    raise exception
      'Test session item is required.';
  end if;

  if p_attempt_id is null then
    raise exception
      'Attempt is required.';
  end if;

  /*
   * Lock the item first so two concurrent selections
   * for the same test are serialized.
   *
   * RLS still applies because this is SECURITY INVOKER.
   */
  perform 1
  from public.test_session_items tsi
  where tsi.id = p_test_session_item_id
  for update;

  if not found then
    raise exception
      'Test session item not found or not accessible.';
  end if;

  select
    ta.quality_status
  into
    target_quality
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

  if target_quality = 'INVALID' then
    raise exception
      'Invalid attempts cannot be selected.';
  end if;

  update public.test_attempts
  set is_selected = false
  where
    test_session_item_id =
      p_test_session_item_id
    and is_selected = true
    and id <> p_attempt_id;

  update public.test_attempts
  set is_selected = true
  where
    id = p_attempt_id
    and test_session_item_id =
      p_test_session_item_id;
end;
$$;

revoke all
on function public.select_test_attempt(uuid, uuid)
from public;

grant execute
on function public.select_test_attempt(uuid, uuid)
to authenticated;

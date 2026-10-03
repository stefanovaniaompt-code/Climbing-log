revoke all on table public.program_calendar_events from anon;
grant select, insert, update, delete on table public.program_calendar_events to authenticated;

revoke all on function public.adjust_prescription_loads(text, uuid, numeric) from anon, public;
grant execute on function public.adjust_prescription_loads(text, uuid, numeric) to authenticated;

revoke all on function public.clone_training_week(uuid) from anon, public;
grant execute on function public.clone_training_week(uuid) to authenticated;

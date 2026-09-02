-- Climbing Coach - collocazione settimanale delle sessioni nel calendario.
-- Migration additiva: le sessioni esistenti vengono distribuite in base al loro ordine.

alter table public.sessions
  add column if not exists scheduled_day smallint;

update public.sessions
set scheduled_day = least(7, greatest(1, session_order))
where scheduled_day is null;

alter table public.sessions
  alter column scheduled_day set default 1,
  alter column scheduled_day set not null,
  drop constraint if exists sessions_scheduled_day_valid,
  add constraint sessions_scheduled_day_valid
    check (scheduled_day between 1 and 7);

comment on column public.sessions.scheduled_day is
  'Giorno ISO della settimana: 1 lunedi, 7 domenica. Piu sessioni possono condividere lo stesso giorno.';

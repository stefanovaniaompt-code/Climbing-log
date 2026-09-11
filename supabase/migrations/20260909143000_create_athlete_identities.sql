-- Additive checkpoint: introduce athlete identities without changing any existing FK.
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null check (length(btrim(last_name)) between 1 and 80),
  email text null check (email is null or length(btrim(email)) between 3 and 320),
  user_id uuid null unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.athletes (id, first_name, last_name, email, user_id, created_at, updated_at)
select p.id,
       coalesce(nullif(btrim(p.first_name), ''), nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''), 'Atleta'),
       coalesce(nullif(btrim(p.last_name), ''), nullif(btrim(substr(coalesce(p.full_name, ''), length(split_part(coalesce(p.full_name, ''), ' ', 1)) + 1)), ''), 'Climbing Coach'),
       nullif(lower(btrim(u.email)), ''), p.id, p.created_at, p.updated_at
from public.profiles p join auth.users u on u.id = p.id where p.role = 'athlete';

create index athletes_user_id_idx on public.athletes(user_id) where user_id is not null;
create index athletes_email_normalized_idx on public.athletes(lower(btrim(email))) where email is not null and user_id is null;
create trigger athletes_set_updated_at before update on public.athletes for each row execute function private.set_updated_at();

alter table public.athletes enable row level security;
create policy athletes_select_related on public.athletes for select using (
  user_id=(select auth.uid()) or private.is_coach_of(id)
);
create policy athletes_update_self on public.athletes for update using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,update on public.athletes to authenticated;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

grant update (must_change_password) on table public.profiles to authenticated;

comment on column public.profiles.must_change_password is
  'Blocks application access until an administrator-assigned temporary password is replaced.';

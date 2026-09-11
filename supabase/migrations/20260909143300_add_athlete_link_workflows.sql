create table public.coach_link_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (coach_id,athlete_id)
);
alter table public.coach_link_requests enable row level security;
create policy coach_link_requests_select_related on public.coach_link_requests for select using (coach_id=(select auth.uid()) or requested_by=(select auth.uid()));
grant select on public.coach_link_requests to authenticated;

create or replace function public.create_managed_athlete(p_first_name text,p_last_name text,p_email text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_email text:=nullif(lower(btrim(p_email)),'');
begin
  if not private.current_user_is_coach() then raise exception 'Operazione riservata al coach'; end if;
  if length(btrim(p_first_name)) not between 1 and 80 or length(btrim(p_last_name)) not between 1 and 80 then raise exception 'Nome e cognome sono obbligatori'; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Email non valida'; end if;
  insert into public.athletes(first_name,last_name,email) values(btrim(p_first_name),btrim(p_last_name),v_email) returning id into v_id;
  insert into public.coach_athletes(coach_id,athlete_id,status) values((select auth.uid()),v_id,'active');
  return v_id;
end; $$;

create or replace function public.request_coach_link(p_coach_email text)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_coach uuid; v_athlete uuid; v_name text;
begin
  if v_user is null then raise exception 'Sessione non valida'; end if;
  select p.id into v_coach from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=lower(btrim(p_coach_email)) and p.role='coach' limit 1;
  if v_coach is null then raise exception 'Coach non disponibile per il collegamento'; end if;
  select id into v_athlete from public.athletes where user_id=v_user limit 1;
  if v_athlete is null then
    select coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),nullif(btrim(full_name),''),'Atleta') into v_name from public.profiles where id=v_user;
    insert into public.athletes(id,first_name,last_name,email,user_id) values(v_user,coalesce(nullif(split_part(v_name,' ',1),''),'Atleta'),coalesce(nullif(btrim(substr(v_name,length(split_part(v_name,' ',1))+1)),''),'Climbing Coach'),lower((select email from auth.users where id=v_user)),v_user) returning id into v_athlete;
  end if;
  if exists(select 1 from public.coach_athletes where coach_id=v_coach and athlete_id=v_athlete and status='active') then return 'active'; end if;
  insert into public.coach_link_requests(coach_id,athlete_id,requested_by,status) values(v_coach,v_athlete,v_user,'pending')
  on conflict(coach_id,athlete_id) do update set status='pending',created_at=now(),decided_at=null,requested_by=excluded.requested_by;
  return 'pending';
end; $$;

create or replace function public.decide_coach_link_request(p_request_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path='' as $$
declare v_request public.coach_link_requests%rowtype; v_status text;
begin
  select * into v_request from public.coach_link_requests where id=p_request_id for update;
  if v_request.id is null or v_request.coach_id<>(select auth.uid()) or not private.current_user_is_coach() then raise exception 'Richiesta non disponibile'; end if;
  if v_request.status<>'pending' then return v_request.status; end if;
  v_status:=case when p_accept then 'accepted' else 'rejected' end;
  update public.coach_link_requests set status=v_status,decided_at=now() where id=p_request_id;
  if p_accept then insert into public.coach_athletes(coach_id,athlete_id,status) values(v_request.coach_id,v_request.athlete_id,'active') on conflict(coach_id,athlete_id) do update set status='active'; end if;
  return v_status;
end; $$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_athlete uuid;
begin
  insert into public.profiles(id,full_name,avatar_url,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),new.raw_user_meta_data->>'avatar_url','athlete');
  select id into v_athlete from public.athletes where user_id is null and lower(btrim(email))=lower(new.email) order by created_at limit 1 for update;
  if v_athlete is null then
    insert into public.athletes(id,first_name,last_name,email,user_id) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'first_name',''),'Atleta'),coalesce(nullif(new.raw_user_meta_data->>'last_name',''),'Climbing Coach'),lower(new.email),new.id);
  else update public.athletes set user_id=new.id where id=v_athlete;
  end if;
  return new;
end; $$;

create or replace function private.activate_athlete_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='accepted' and old.status='pending' and new.athlete_id is not null then
    if not exists(select 1 from public.profiles where id=new.coach_id and role='coach') then raise exception 'Coach non valido'; end if;
    if not private.is_athlete(new.athlete_id) then raise exception 'Atleta non valido'; end if;
    insert into public.coach_athletes(coach_id,athlete_id,status) values(new.coach_id,new.athlete_id,'active') on conflict(coach_id,athlete_id) do update set status='active';
  end if;
  return new;
end; $$;

grant execute on function public.create_managed_athlete(text,text,text) to authenticated;
grant execute on function public.request_coach_link(text) to authenticated;
grant execute on function public.decide_coach_link_request(uuid,boolean) to authenticated;
revoke all on function public.create_managed_athlete(text,text,text) from anon,public;
revoke all on function public.request_coach_link(text) from anon,public;
revoke all on function public.decide_coach_link_request(uuid,boolean) from anon,public;

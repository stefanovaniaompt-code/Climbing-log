-- When Auth is created after a coach invitation, attach it to the existing Athlete
-- identity and close the invitation without changing the athlete UUID.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_athlete uuid;
begin
  insert into public.profiles(id,full_name,avatar_url,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),new.raw_user_meta_data->>'avatar_url','athlete');

  select id into v_athlete from public.athletes
  where user_id is null and lower(btrim(email))=lower(new.email)
  order by created_at limit 1 for update;

  if v_athlete is null then
    insert into public.athletes(id,first_name,last_name,email,user_id)
    values(new.id,coalesce(nullif(new.raw_user_meta_data->>'first_name',''),'Atleta'),coalesce(nullif(new.raw_user_meta_data->>'last_name',''),'Climbing Coach'),lower(new.email),new.id)
    returning id into v_athlete;
  else
    update public.athletes set user_id=new.id where id=v_athlete;
  end if;

  update public.athlete_invitations
  set athlete_id=v_athlete,status='accepted',accepted_at=now()
  where email_normalized=lower(new.email) and status='pending';
  return new;
end; $$;

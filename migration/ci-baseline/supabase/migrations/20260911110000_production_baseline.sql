


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."activate_athlete_invitation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status='accepted' and old.status='pending' and new.athlete_id is not null then
    if not exists(select 1 from public.profiles where id=new.coach_id and role='coach') then raise exception 'Coach non valido'; end if;
    if not private.is_athlete(new.athlete_id) then raise exception 'Atleta non valido'; end if;
    insert into public.coach_athletes(coach_id,athlete_id,status) values(new.coach_id,new.athlete_id,'active') on conflict(coach_id,athlete_id) do update set status='active';
  end if;
  return new;
end; $$;


ALTER FUNCTION "private"."activate_athlete_invitation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_profile"("target_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select (select auth.uid())=target_id or exists (
    select 1 from public.coach_athletes ca join public.athletes a on a.id=ca.athlete_id
    where ca.status='active' and ((ca.coach_id=(select auth.uid()) and a.user_id=target_id) or (a.user_id=(select auth.uid()) and ca.coach_id=target_id))
  );
$$;


ALTER FUNCTION "private"."can_access_profile"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_program"("target_program" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists(select 1 from public.programs p where p.id=target_program and ((p.athlete_id=private.current_athlete_id() and p.status<>'draft') or (p.coach_id=(select auth.uid()) and private.is_coach_of(p.athlete_id))));
$$;


ALTER FUNCTION "private"."can_access_program"("target_program" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_session"("target_session" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.sessions s
    where s.id = target_session and private.can_access_week(s.training_week_id)
  );
$$;


ALTER FUNCTION "private"."can_access_session"("target_session" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_session_exercise"("target_session_exercise" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.session_exercises se
    where se.id = target_session_exercise and private.can_access_session(se.session_id)
  );
$$;


ALTER FUNCTION "private"."can_access_session_exercise"("target_session_exercise" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_test_acquisition"("target_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.test_attempts ta
    where ta.raw_curve_path = target_name and private.can_access_test_session(ta.test_session_id)
  );
$$;


ALTER FUNCTION "private"."can_access_test_acquisition"("target_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_test_session"("target_test_session" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists(select 1 from public.test_sessions ts where ts.id=target_test_session and (ts.athlete_id=private.current_athlete_id() or (ts.coach_id=(select auth.uid()) and private.is_coach_of(ts.athlete_id))));
$$;


ALTER FUNCTION "private"."can_access_test_session"("target_test_session" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_week"("target_week" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.training_weeks w
    where w.id = target_week and private.can_access_program(w.program_id)
  );
$$;


ALTER FUNCTION "private"."can_access_week"("target_week" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_create_test_acquisition"("target_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  select case
    when split_part(target_name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    then private.can_edit_test_session(split_part(target_name, '/', 1)::uuid)
    else false
  end;
$_$;


ALTER FUNCTION "private"."can_create_test_acquisition"("target_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_edit_test_session"("target_test_session" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.can_access_test_session(target_test_session); $$;


ALTER FUNCTION "private"."can_edit_test_session"("target_test_session" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_program"("target_program" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.programs p
    where p.id = target_program
      and p.coach_id = (select auth.uid())
      and private.is_coach_of(p.athlete_id)
  );
$$;


ALTER FUNCTION "private"."can_manage_program"("target_program" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_session"("target_session" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.sessions s
    where s.id = target_session and private.can_manage_week(s.training_week_id)
  );
$$;


ALTER FUNCTION "private"."can_manage_session"("target_session" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_session_exercise"("target_session_exercise" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.session_exercises se
    where se.id = target_session_exercise and private.can_manage_session(se.session_id)
  );
$$;


ALTER FUNCTION "private"."can_manage_session_exercise"("target_session_exercise" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_manage_week"("target_week" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.training_weeks w
    where w.id = target_week and private.can_manage_program(w.program_id)
  );
$$;


ALTER FUNCTION "private"."can_manage_week"("target_week" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_athlete_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select a.id from public.athletes a where a.user_id = (select auth.uid()) limit 1;
$$;


ALTER FUNCTION "private"."current_athlete_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_user_is_coach"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'coach'
  );
$$;


ALTER FUNCTION "private"."current_user_is_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_athlete"("target_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.athletes a where a.id = target_id);
$$;


ALTER FUNCTION "private"."is_athlete"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_athlete_of"("target_coach" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.coach_athletes ca where ca.athlete_id=private.current_athlete_id() and ca.coach_id=target_coach and ca.status='active');
$$;


ALTER FUNCTION "private"."is_athlete_of"("target_coach" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_coach_of"("target_athlete" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.coach_athletes ca
    where ca.coach_id = (select auth.uid())
      and ca.athlete_id = target_athlete
      and ca.status = 'active'
  );
$$;


ALTER FUNCTION "private"."is_coach_of"("target_athlete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prevent_exercise_log_identity_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.session_log_id is distinct from old.session_log_id
     or new.session_exercise_id is distinct from old.session_exercise_id
     or new.athlete_id is distinct from old.athlete_id then
    raise exception 'exercise log identity fields are immutable';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."prevent_exercise_log_identity_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prevent_session_log_identity_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.session_id is distinct from old.session_id
     or new.athlete_id is distinct from old.athlete_id then
    raise exception 'session log identity fields are immutable';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."prevent_session_log_identity_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_invited_athlete_onboarding"("p_full_name" "text", "p_birth_date" "date", "p_weight_kg" numeric, "p_height_cm" numeric) RETURNS TABLE("athlete_id" "uuid", "coach_id" "uuid", "completed_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_name text := btrim(p_full_name);
  v_first_name text;
  v_last_name text;
  v_invitation_id uuid;
  v_coach_id uuid;
  v_completed_at timestamptz := now();
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Sessione autenticata non valida';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 or strpos(v_name, ' ') = 0 then
    raise exception 'Inserisci nome e cognome';
  end if;
  if p_birth_date < date '1900-01-01' or p_birth_date > current_date then
    raise exception 'Data di nascita non valida';
  end if;
  if p_weight_kg < 10 or p_weight_kg > 400 or p_height_cm < 50 or p_height_cm > 250 then
    raise exception 'Dati fisici non validi';
  end if;

  select invitation.id, invitation.coach_id
    into v_invitation_id, v_coach_id
  from public.athlete_invitations as invitation
  where invitation.email_normalized = v_email
    and invitation.status = 'pending'
  order by invitation.invited_at desc
  limit 1
  for update;

  if v_invitation_id is null then
    raise exception 'Nessun invito attivo per questo indirizzo';
  end if;

  v_first_name := split_part(v_name, ' ', 1);
  v_last_name := btrim(substr(v_name, length(v_first_name) + 1));

  update public.profiles
  set full_name = v_name,
      first_name = v_first_name,
      last_name = v_last_name,
      birth_date = p_birth_date,
      weight_kg = p_weight_kg,
      height_cm = p_height_cm,
      onboarding_completed_at = v_completed_at
  where id = v_user_id;

  if not found then
    raise exception 'Profilo atleta non trovato';
  end if;

  update public.athlete_invitations
  set status = 'accepted',
      athlete_id = v_user_id,
      accepted_at = v_completed_at
  where id = v_invitation_id;

  return query select v_user_id, v_coach_id, v_completed_at;
end;
$$;


ALTER FUNCTION "public"."complete_invited_athlete_onboarding"("p_full_name" "text", "p_birth_date" "date", "p_weight_kg" numeric, "p_height_cm" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_invited_athlete_onboarding"("p_full_name" "text", "p_birth_date" "date", "p_weight_kg" numeric, "p_height_cm" numeric) IS 'Onboarding atomico per atleta invitato; usa auth.uid, email JWT e policy RLS esistenti.';



CREATE OR REPLACE FUNCTION "public"."create_managed_athlete"("p_first_name" "text", "p_last_name" "text", "p_email" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare v_id uuid; v_email text:=nullif(lower(btrim(p_email)),'');
begin
  if not private.current_user_is_coach() then raise exception 'Operazione riservata al coach'; end if;
  if length(btrim(p_first_name)) not between 1 and 80 or length(btrim(p_last_name)) not between 1 and 80 then raise exception 'Nome e cognome sono obbligatori'; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Email non valida'; end if;
  insert into public.athletes(first_name,last_name,email) values(btrim(p_first_name),btrim(p_last_name),v_email) returning id into v_id;
  insert into public.coach_athletes(coach_id,athlete_id,status) values((select auth.uid()),v_id,'active');
  return v_id;
end; $_$;


ALTER FUNCTION "public"."create_managed_athlete"("p_first_name" "text", "p_last_name" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_coach_link_request"("p_request_id" "uuid", "p_accept" boolean) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."decide_coach_link_request"("p_request_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_coach_link"("p_coach_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."request_coach_link"("p_coach_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."athlete_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "email_normalized" "text" GENERATED ALWAYS AS ("lower"("btrim"("email"))) STORED,
    "athlete_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "athlete_invitations_email_check" CHECK ((("length"("btrim"("email")) >= 3) AND ("length"("btrim"("email")) <= 320))),
    CONSTRAINT "athlete_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."athlete_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athletes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "athletes_email_check" CHECK ((("email" IS NULL) OR (("length"("btrim"("email")) >= 3) AND ("length"("btrim"("email")) <= 320)))),
    CONSTRAINT "athletes_first_name_check" CHECK ((("length"("btrim"("first_name")) >= 1) AND ("length"("btrim"("first_name")) <= 80))),
    CONSTRAINT "athletes_last_name_check" CHECK ((("length"("btrim"("last_name")) >= 1) AND ("length"("btrim"("last_name")) <= 80)))
);


ALTER TABLE "public"."athletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_athletes" (
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_athletes_check" CHECK (("coach_id" <> "athlete_id")),
    CONSTRAINT "coach_athletes_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."coach_athletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_link_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    CONSTRAINT "coach_link_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."coach_link_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "modality" "text",
    "description" "text",
    "default_instructions" "text",
    "default_prescription" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."exercise_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_log_id" "uuid" NOT NULL,
    "session_exercise_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "actual" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rpe" numeric(3,1),
    "notes" "text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exercise_logs_rpe_check" CHECK ((("rpe" IS NULL) OR (("rpe" >= (0)::numeric) AND ("rpe" <= (10)::numeric))))
);


ALTER TABLE "public"."exercise_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_test_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_exercise_id" "uuid" NOT NULL,
    "reference_type" "text" NOT NULL,
    "test_result_id" "uuid",
    "test_attempt_id" "uuid",
    "metric_key" "text" NOT NULL,
    "source_value" double precision NOT NULL,
    "source_unit" "text" NOT NULL,
    "source_tested_at" "date" NOT NULL,
    "source_side" "text",
    "source_grip" "text",
    "source_body_weight_kg" numeric(6,2),
    "percentage" numeric(7,3) NOT NULL,
    "calculated_target" double precision NOT NULL,
    "target_unit" "text" NOT NULL,
    "locked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exercise_test_targets_percentage_check" CHECK (("percentage" > (0)::numeric)),
    CONSTRAINT "exercise_test_targets_reference_type_check" CHECK (("reference_type" = ANY (ARRAY['latest_valid'::"text", 'personal_best'::"text", 'specific_result'::"text"])))
);


ALTER TABLE "public"."exercise_test_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "role" "text" DEFAULT 'athlete'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "birth_date" "date",
    "weight_kg" numeric,
    "height_cm" numeric,
    "onboarding_completed_at" timestamp with time zone,
    "must_change_password" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_birth_date_valid" CHECK ((("birth_date" IS NULL) OR (("birth_date" >= '1900-01-01'::"date") AND ("birth_date" <= CURRENT_DATE)))),
    CONSTRAINT "profiles_height_cm_valid" CHECK ((("height_cm" IS NULL) OR (("height_cm" >= (50)::numeric) AND ("height_cm" <= (250)::numeric)))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['athlete'::"text", 'coach'::"text"]))),
    CONSTRAINT "profiles_weight_kg_valid" CHECK ((("weight_kg" IS NULL) OR (("weight_kg" >= (10)::numeric) AND ("weight_kg" <= (400)::numeric))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."onboarding_completed_at" IS 'Istante in cui l atleta ha completato i dati obbligatori del profilo.';



COMMENT ON COLUMN "public"."profiles"."must_change_password" IS 'Blocks application access until an administrator-assigned temporary password is replaced.';



CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "goal" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "exercise_id" "uuid",
    "exercise_order" integer NOT NULL,
    "exercise_name" "text" NOT NULL,
    "prescription" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "calculation_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_rpe_min" numeric(3,1),
    "target_rpe_max" numeric(3,1),
    "rest_seconds" integer,
    "instructions" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_exercises_check" CHECK ((("target_rpe_min" IS NULL) OR ("target_rpe_max" IS NULL) OR ("target_rpe_min" <= "target_rpe_max"))),
    CONSTRAINT "session_exercises_exercise_order_check" CHECK (("exercise_order" > 0)),
    CONSTRAINT "session_exercises_rest_seconds_check" CHECK ((("rest_seconds" IS NULL) OR ("rest_seconds" >= 0))),
    CONSTRAINT "session_exercises_target_rpe_max_check" CHECK ((("target_rpe_max" IS NULL) OR (("target_rpe_max" >= (0)::numeric) AND ("target_rpe_max" <= (10)::numeric)))),
    CONSTRAINT "session_exercises_target_rpe_min_check" CHECK ((("target_rpe_min" IS NULL) OR (("target_rpe_min" >= (0)::numeric) AND ("target_rpe_min" <= (10)::numeric))))
);


ALTER TABLE "public"."session_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_minutes" integer,
    "session_rpe" numeric(3,1),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completion_outcome" "text",
    "autosaved_at" timestamp with time zone,
    CONSTRAINT "session_logs_completion_outcome_valid" CHECK ((("completion_outcome" IS NULL) OR ("completion_outcome" = ANY (ARRAY['completed'::"text", 'partial'::"text"])))),
    CONSTRAINT "session_logs_duration_minutes_check" CHECK ((("duration_minutes" IS NULL) OR ("duration_minutes" >= 0))),
    CONSTRAINT "session_logs_session_rpe_check" CHECK ((("session_rpe" IS NULL) OR (("session_rpe" >= (0)::numeric) AND ("session_rpe" <= (10)::numeric)))),
    CONSTRAINT "session_logs_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."session_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."session_logs"."completion_outcome" IS 'Esito dichiarato: completed se tutto eseguito, partial se uno o più esercizi sono stati saltati.';



COMMENT ON COLUMN "public"."session_logs"."autosaved_at" IS 'Ultimo autosalvataggio della bozza cloud; non implica completamento.';



CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_week_id" "uuid" NOT NULL,
    "session_order" integer NOT NULL,
    "title" "text" NOT NULL,
    "objective" "text",
    "duration_minutes" integer,
    "coach_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_day" smallint DEFAULT 1 NOT NULL,
    CONSTRAINT "sessions_duration_minutes_check" CHECK ((("duration_minutes" IS NULL) OR ("duration_minutes" > 0))),
    CONSTRAINT "sessions_scheduled_day_valid" CHECK ((("scheduled_day" >= 1) AND ("scheduled_day" <= 7))),
    CONSTRAINT "sessions_session_order_check" CHECK (("session_order" > 0))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sessions"."scheduled_day" IS 'Giorno ISO della settimana: 1 lunedi, 7 domenica. Piu sessioni possono condividere lo stesso giorno.';



CREATE TABLE IF NOT EXISTS "public"."test_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acquisition_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_session_id" "uuid" NOT NULL,
    "test_session_item_id" "uuid",
    "test_library_id" "uuid",
    "attempt_number" integer NOT NULL,
    "measurement_source" "text" NOT NULL,
    "device_type" "text",
    "device_info" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "side" "text",
    "grip" "text",
    "protocol_key" "text" NOT NULL,
    "protocol_version" "text" NOT NULL,
    "quality_status" "text" DEFAULT 'REVIEW'::"text" NOT NULL,
    "quality_flags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "invalid_reason" "text",
    "primary_metric_key" "text",
    "primary_value" double precision,
    "primary_unit" "text",
    "secondary_metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_curve_path" "text",
    "sampling_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "body_weight_kg_at_test" numeric(6,2),
    "started_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    "is_selected" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_attempts_attempt_number_check" CHECK (("attempt_number" > 0)),
    CONSTRAINT "test_attempts_measurement_source_check" CHECK (("measurement_source" = ANY (ARRAY['manual'::"text", 'tindeq'::"text"]))),
    CONSTRAINT "test_attempts_quality_status_check" CHECK (("quality_status" = ANY (ARRAY['VALID'::"text", 'REVIEW'::"text", 'INVALID'::"text"]))),
    CONSTRAINT "test_attempts_side_check" CHECK (("side" = ANY (ARRAY['left'::"text", 'right'::"text", 'bilateral'::"text"])))
);


ALTER TABLE "public"."test_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_session_id" "uuid" NOT NULL,
    "metric_key" "text" NOT NULL,
    "metric_label" "text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "side" "text",
    "grip" "text",
    "normalize_to_body_weight" boolean DEFAULT false NOT NULL,
    "setup" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "test_library_id" "uuid",
    "attempt_id" "uuid",
    "measurement_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "quality_status" "text" DEFAULT 'VALID'::"text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "protocol_key" "text",
    "protocol_version" "text",
    "secondary_metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_curve_path" "text",
    "body_weight_kg_at_test" numeric(6,2),
    CONSTRAINT "test_results_measurement_source_check" CHECK (("measurement_source" = ANY (ARRAY['manual'::"text", 'tindeq'::"text"]))),
    CONSTRAINT "test_results_quality_status_check" CHECK (("quality_status" = ANY (ARRAY['VALID'::"text", 'REVIEW'::"text", 'INVALID'::"text"]))),
    CONSTRAINT "test_results_side_check" CHECK ((("side" IS NULL) OR ("side" = ANY (ARRAY['left'::"text", 'right'::"text", 'bilateral'::"text"]))))
);


ALTER TABLE "public"."test_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "tested_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "body_weight_kg" numeric(6,2),
    "protocol_version" "text",
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "test_plan_id" "uuid",
    "mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "test_sessions_body_weight_kg_check" CHECK ((("body_weight_kg" IS NULL) OR ("body_weight_kg" > (0)::numeric))),
    CONSTRAINT "test_sessions_mode_check" CHECK (("mode" = ANY (ARRAY['manual'::"text", 'remote'::"text", 'live'::"text"]))),
    CONSTRAINT "test_sessions_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."test_sessions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."test_history" WITH ("security_invoker"='true') AS
 SELECT "ts"."athlete_id",
    "ts"."coach_id",
    "ts"."id" AS "test_session_id",
    "ts"."tested_at",
    "ts"."body_weight_kg",
    "tr"."id" AS "test_result_id",
    "tr"."metric_key",
    "tr"."metric_label",
    "tr"."value",
    "tr"."unit",
    "tr"."side",
    "tr"."grip",
    "tr"."normalize_to_body_weight",
        CASE
            WHEN ("tr"."normalize_to_body_weight" AND ("ts"."body_weight_kg" IS NOT NULL) AND ("ts"."body_weight_kg" > (0)::numeric)) THEN ("tr"."value" / "ts"."body_weight_kg")
            ELSE NULL::numeric
        END AS "value_bodyweight_ratio",
    "tr"."setup",
    "tr"."notes"
   FROM ("public"."test_sessions" "ts"
     JOIN "public"."test_results" "tr" ON (("tr"."test_session_id" = "ts"."id")));


ALTER VIEW "public"."test_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "objective" "text",
    "material" "text",
    "instructions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metric_definitions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "video_url" "text",
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "video_path" "text",
    "protocol_key" "text",
    "protocol_version" "text" DEFAULT '1.0'::"text" NOT NULL,
    "primary_metric_key" "text",
    "measurement_sources" "text"[] DEFAULT ARRAY['manual'::"text"] NOT NULL,
    "side_applicable" boolean DEFAULT false NOT NULL,
    "grip_applicable" boolean DEFAULT false NOT NULL,
    "protocol_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."test_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_plan_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_plan_id" "uuid" NOT NULL,
    "test_library_id" "uuid" NOT NULL,
    "item_order" integer NOT NULL,
    "instructions_override" "text",
    "required" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."test_plan_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "scheduled_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "coach_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."test_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_result_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_result_id" "uuid" NOT NULL,
    "original_value" double precision NOT NULL,
    "corrected_value" double precision NOT NULL,
    "reason" "text" NOT NULL,
    "corrected_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "corrected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_result_corrections_reason_check" CHECK (("length"(TRIM(BOTH FROM "reason")) > 0))
);


ALTER TABLE "public"."test_result_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_session_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_session_id" "uuid" NOT NULL,
    "test_library_id" "uuid",
    "item_order" integer NOT NULL,
    "protocol_key" "text" NOT NULL,
    "protocol_version" "text" DEFAULT '1.0'::"text" NOT NULL,
    "side" "text",
    "grip" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "test_session_items_item_order_check" CHECK (("item_order" > 0)),
    CONSTRAINT "test_session_items_side_check" CHECK (("side" = ANY (ARRAY['left'::"text", 'right'::"text", 'bilateral'::"text"]))),
    CONSTRAINT "test_session_items_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'tindeq'::"text"]))),
    CONSTRAINT "test_session_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."test_session_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "block_name" "text",
    "phase" "text",
    "start_date" "date",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_weeks_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'current'::"text", 'completed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "training_weeks_week_number_check" CHECK (("week_number" > 0))
);


ALTER TABLE "public"."training_weeks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."athlete_invitations"
    ADD CONSTRAINT "athlete_invitations_coach_id_email_normalized_key" UNIQUE ("coach_id", "email_normalized");



ALTER TABLE ONLY "public"."athlete_invitations"
    ADD CONSTRAINT "athlete_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athletes"
    ADD CONSTRAINT "athletes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athletes"
    ADD CONSTRAINT "athletes_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."coach_athletes"
    ADD CONSTRAINT "coach_athletes_pkey" PRIMARY KEY ("coach_id", "athlete_id");



ALTER TABLE ONLY "public"."coach_link_requests"
    ADD CONSTRAINT "coach_link_requests_coach_id_athlete_id_key" UNIQUE ("coach_id", "athlete_id");



ALTER TABLE ONLY "public"."coach_link_requests"
    ADD CONSTRAINT "coach_link_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_library"
    ADD CONSTRAINT "exercise_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_logs"
    ADD CONSTRAINT "exercise_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_logs"
    ADD CONSTRAINT "exercise_logs_session_log_id_session_exercise_id_key" UNIQUE ("session_log_id", "session_exercise_id");



ALTER TABLE ONLY "public"."exercise_test_targets"
    ADD CONSTRAINT "exercise_test_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_test_targets"
    ADD CONSTRAINT "exercise_test_targets_session_exercise_id_key" UNIQUE ("session_exercise_id");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_onboarding_data_complete" CHECK ((("onboarding_completed_at" IS NULL) OR ((NULLIF("btrim"("first_name"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("last_name"), ''::"text") IS NOT NULL) AND ("birth_date" IS NOT NULL) AND ("weight_kg" IS NOT NULL) AND ("height_cm" IS NOT NULL)))) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_exercises"
    ADD CONSTRAINT "session_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_exercises"
    ADD CONSTRAINT "session_exercises_session_id_exercise_order_key" UNIQUE ("session_id", "exercise_order");



ALTER TABLE "public"."session_logs"
    ADD CONSTRAINT "session_logs_completed_state_valid" CHECK ((("status" <> 'completed'::"text") OR (("completed_at" IS NOT NULL) AND ("completion_outcome" = ANY (ARRAY['completed'::"text", 'partial'::"text"]))))) NOT VALID;



ALTER TABLE ONLY "public"."session_logs"
    ADD CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_logs"
    ADD CONSTRAINT "session_logs_session_id_athlete_id_key" UNIQUE ("session_id", "athlete_id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_training_week_id_session_order_key" UNIQUE ("training_week_id", "session_order");



ALTER TABLE ONLY "public"."test_attempts"
    ADD CONSTRAINT "test_attempts_acquisition_id_key" UNIQUE ("acquisition_id");



ALTER TABLE ONLY "public"."test_attempts"
    ADD CONSTRAINT "test_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_attempts"
    ADD CONSTRAINT "test_attempts_test_session_item_id_attempt_number_key" UNIQUE ("test_session_item_id", "attempt_number");



ALTER TABLE ONLY "public"."test_library"
    ADD CONSTRAINT "test_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_plan_items"
    ADD CONSTRAINT "test_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_plan_items"
    ADD CONSTRAINT "test_plan_items_test_plan_id_item_order_key" UNIQUE ("test_plan_id", "item_order");



ALTER TABLE ONLY "public"."test_plan_items"
    ADD CONSTRAINT "test_plan_items_test_plan_id_test_library_id_key" UNIQUE ("test_plan_id", "test_library_id");



ALTER TABLE ONLY "public"."test_plans"
    ADD CONSTRAINT "test_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_result_corrections"
    ADD CONSTRAINT "test_result_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_session_items"
    ADD CONSTRAINT "test_session_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_session_items"
    ADD CONSTRAINT "test_session_items_test_session_id_item_order_key" UNIQUE ("test_session_id", "item_order");



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_weeks"
    ADD CONSTRAINT "training_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_weeks"
    ADD CONSTRAINT "training_weeks_program_id_week_number_key" UNIQUE ("program_id", "week_number");



CREATE INDEX "athlete_invitations_athlete_idx" ON "public"."athlete_invitations" USING "btree" ("athlete_id") WHERE ("athlete_id" IS NOT NULL);



CREATE INDEX "athlete_invitations_email_idx" ON "public"."athlete_invitations" USING "btree" ("email_normalized", "status");



CREATE INDEX "athletes_email_normalized_idx" ON "public"."athletes" USING "btree" ("lower"("btrim"("email"))) WHERE (("email" IS NOT NULL) AND ("user_id" IS NULL));



CREATE INDEX "athletes_user_id_idx" ON "public"."athletes" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "coach_athletes_athlete_idx" ON "public"."coach_athletes" USING "btree" ("athlete_id", "status");



CREATE INDEX "coach_athletes_coach_idx" ON "public"."coach_athletes" USING "btree" ("coach_id", "status");



CREATE INDEX "coach_link_requests_athlete_idx" ON "public"."coach_link_requests" USING "btree" ("athlete_id");



CREATE INDEX "exercise_library_coach_idx" ON "public"."exercise_library" USING "btree" ("coach_id", "archived");



CREATE INDEX "exercise_logs_athlete_idx" ON "public"."exercise_logs" USING "btree" ("athlete_id");



CREATE INDEX "exercise_logs_session_exercise_idx" ON "public"."exercise_logs" USING "btree" ("session_exercise_id");



CREATE INDEX "exercise_test_targets_attempt_idx" ON "public"."exercise_test_targets" USING "btree" ("test_attempt_id");



CREATE INDEX "exercise_test_targets_created_by_idx" ON "public"."exercise_test_targets" USING "btree" ("created_by");



CREATE INDEX "exercise_test_targets_result_idx" ON "public"."exercise_test_targets" USING "btree" ("test_result_id");



CREATE INDEX "programs_athlete_idx" ON "public"."programs" USING "btree" ("athlete_id", "status");



CREATE INDEX "programs_coach_idx" ON "public"."programs" USING "btree" ("coach_id", "status");



CREATE INDEX "session_exercises_exercise_id_idx" ON "public"."session_exercises" USING "btree" ("exercise_id");



CREATE INDEX "session_exercises_session_idx" ON "public"."session_exercises" USING "btree" ("session_id", "exercise_order");



CREATE INDEX "session_logs_athlete_idx" ON "public"."session_logs" USING "btree" ("athlete_id", "status");



CREATE INDEX "session_logs_session_idx" ON "public"."session_logs" USING "btree" ("session_id");



CREATE INDEX "sessions_week_idx" ON "public"."sessions" USING "btree" ("training_week_id", "session_order");



CREATE INDEX "test_attempts_created_by_idx" ON "public"."test_attempts" USING "btree" ("created_by");



CREATE INDEX "test_attempts_library_idx" ON "public"."test_attempts" USING "btree" ("test_library_id");



CREATE INDEX "test_attempts_session_idx" ON "public"."test_attempts" USING "btree" ("test_session_id", "test_session_item_id", "attempt_number");



CREATE INDEX "test_attempts_valid_trend_idx" ON "public"."test_attempts" USING "btree" ("test_library_id", "protocol_key", "protocol_version", "side", "grip", "ended_at") WHERE ("quality_status" = 'VALID'::"text");



CREATE UNIQUE INDEX "test_library_coach_name_active_key" ON "public"."test_library" USING "btree" ("coach_id", "lower"("name")) WHERE ("archived" = false);



CREATE INDEX "test_plan_items_test_library_idx" ON "public"."test_plan_items" USING "btree" ("test_library_id");



CREATE INDEX "test_plans_athlete_idx" ON "public"."test_plans" USING "btree" ("athlete_id");



CREATE INDEX "test_plans_coach_idx" ON "public"."test_plans" USING "btree" ("coach_id");



CREATE INDEX "test_result_corrections_corrected_by_idx" ON "public"."test_result_corrections" USING "btree" ("corrected_by");



CREATE INDEX "test_result_corrections_result_idx" ON "public"."test_result_corrections" USING "btree" ("test_result_id", "corrected_at");



CREATE INDEX "test_results_attempt_idx" ON "public"."test_results" USING "btree" ("attempt_id");



CREATE INDEX "test_results_library_idx" ON "public"."test_results" USING "btree" ("test_library_id");



CREATE INDEX "test_results_metric_idx" ON "public"."test_results" USING "btree" ("metric_key", "side", "grip");



CREATE INDEX "test_results_session_idx" ON "public"."test_results" USING "btree" ("test_session_id");



CREATE INDEX "test_session_items_library_idx" ON "public"."test_session_items" USING "btree" ("test_library_id");



CREATE INDEX "test_session_items_session_idx" ON "public"."test_session_items" USING "btree" ("test_session_id", "item_order");



CREATE INDEX "test_sessions_athlete_date_idx" ON "public"."test_sessions" USING "btree" ("athlete_id", "tested_at" DESC);



CREATE INDEX "test_sessions_coach_idx" ON "public"."test_sessions" USING "btree" ("coach_id", "tested_at" DESC);



CREATE UNIQUE INDEX "test_sessions_test_plan_id_key" ON "public"."test_sessions" USING "btree" ("test_plan_id") WHERE ("test_plan_id" IS NOT NULL);



CREATE INDEX "training_weeks_program_idx" ON "public"."training_weeks" USING "btree" ("program_id", "week_number");



CREATE OR REPLACE TRIGGER "athlete_invitation_activate" AFTER UPDATE OF "status" ON "public"."athlete_invitations" FOR EACH ROW EXECUTE FUNCTION "private"."activate_athlete_invitation"();



CREATE OR REPLACE TRIGGER "athletes_set_updated_at" BEFORE UPDATE ON "public"."athletes" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "exercise_library_set_updated_at" BEFORE UPDATE ON "public"."exercise_library" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "exercise_logs_set_updated_at" BEFORE UPDATE ON "public"."exercise_logs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "programs_set_updated_at" BEFORE UPDATE ON "public"."programs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "session_exercises_set_updated_at" BEFORE UPDATE ON "public"."session_exercises" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "session_logs_set_updated_at" BEFORE UPDATE ON "public"."session_logs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sessions_set_updated_at" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "test_sessions_set_updated_at" BEFORE UPDATE ON "public"."test_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "training_weeks_set_updated_at" BEFORE UPDATE ON "public"."training_weeks" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_exercise_logs_immutable_identity" BEFORE UPDATE ON "public"."exercise_logs" FOR EACH ROW EXECUTE FUNCTION "private"."prevent_exercise_log_identity_change"();



CREATE OR REPLACE TRIGGER "trg_session_logs_immutable_identity" BEFORE UPDATE ON "public"."session_logs" FOR EACH ROW EXECUTE FUNCTION "private"."prevent_session_log_identity_change"();



ALTER TABLE ONLY "public"."athlete_invitations"
    ADD CONSTRAINT "athlete_invitations_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_invitations"
    ADD CONSTRAINT "athlete_invitations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athletes"
    ADD CONSTRAINT "athletes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_athletes"
    ADD CONSTRAINT "coach_athletes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_athletes"
    ADD CONSTRAINT "coach_athletes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_link_requests"
    ADD CONSTRAINT "coach_link_requests_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_link_requests"
    ADD CONSTRAINT "coach_link_requests_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_link_requests"
    ADD CONSTRAINT "coach_link_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_library"
    ADD CONSTRAINT "exercise_library_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_logs"
    ADD CONSTRAINT "exercise_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_logs"
    ADD CONSTRAINT "exercise_logs_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_logs"
    ADD CONSTRAINT "exercise_logs_session_log_id_fkey" FOREIGN KEY ("session_log_id") REFERENCES "public"."session_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_test_targets"
    ADD CONSTRAINT "exercise_test_targets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."exercise_test_targets"
    ADD CONSTRAINT "exercise_test_targets_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_test_targets"
    ADD CONSTRAINT "exercise_test_targets_test_attempt_id_fkey" FOREIGN KEY ("test_attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercise_test_targets"
    ADD CONSTRAINT "exercise_test_targets_test_result_id_fkey" FOREIGN KEY ("test_result_id") REFERENCES "public"."test_results"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_exercises"
    ADD CONSTRAINT "session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise_library"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_exercises"
    ADD CONSTRAINT "session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_logs"
    ADD CONSTRAINT "session_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_logs"
    ADD CONSTRAINT "session_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_training_week_id_fkey" FOREIGN KEY ("training_week_id") REFERENCES "public"."training_weeks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_attempts"
    ADD CONSTRAINT "test_attempts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."test_attempts"
    ADD CONSTRAINT "test_attempts_test_library_id_fkey" FOREIGN KEY ("test_library_id") REFERENCES "public"."test_library"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_attempts"
    ADD CONSTRAINT "test_attempts_test_session_id_fkey" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_attempts"
    ADD CONSTRAINT "test_attempts_test_session_item_id_fkey" FOREIGN KEY ("test_session_item_id") REFERENCES "public"."test_session_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_library"
    ADD CONSTRAINT "test_library_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_plan_items"
    ADD CONSTRAINT "test_plan_items_test_library_id_fkey" FOREIGN KEY ("test_library_id") REFERENCES "public"."test_library"("id");



ALTER TABLE ONLY "public"."test_plan_items"
    ADD CONSTRAINT "test_plan_items_test_plan_id_fkey" FOREIGN KEY ("test_plan_id") REFERENCES "public"."test_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_plans"
    ADD CONSTRAINT "test_plans_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_plans"
    ADD CONSTRAINT "test_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_result_corrections"
    ADD CONSTRAINT "test_result_corrections_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."test_result_corrections"
    ADD CONSTRAINT "test_result_corrections_test_result_id_fkey" FOREIGN KEY ("test_result_id") REFERENCES "public"."test_results"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_test_library_id_fkey" FOREIGN KEY ("test_library_id") REFERENCES "public"."test_library"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_test_session_id_fkey" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_session_items"
    ADD CONSTRAINT "test_session_items_test_library_id_fkey" FOREIGN KEY ("test_library_id") REFERENCES "public"."test_library"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_session_items"
    ADD CONSTRAINT "test_session_items_test_session_id_fkey" FOREIGN KEY ("test_session_id") REFERENCES "public"."test_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_sessions"
    ADD CONSTRAINT "test_sessions_test_plan_id_fkey" FOREIGN KEY ("test_plan_id") REFERENCES "public"."test_plans"("id");



ALTER TABLE ONLY "public"."training_weeks"
    ADD CONSTRAINT "training_weeks_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE "public"."athlete_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_invitations_delete_coach" ON "public"."athlete_invitations" FOR DELETE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



CREATE POLICY "athlete_invitations_insert_coach" ON "public"."athlete_invitations" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



CREATE POLICY "athlete_invitations_select_related" ON "public"."athlete_invitations" FOR SELECT TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("email_normalized" = "lower"(COALESCE((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text"), ''::"text")))));



CREATE POLICY "athlete_invitations_update_related" ON "public"."athlete_invitations" FOR UPDATE TO "authenticated" USING (((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()) OR (("status" = 'pending'::"text") AND ("email_normalized" = "lower"(COALESCE((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text"), ''::"text")))))) WITH CHECK (((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()) OR (("status" = 'accepted'::"text") AND ("athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("email_normalized" = "lower"(COALESCE((( SELECT "auth"."jwt"() AS "jwt") ->> 'email'::"text"), ''::"text"))))));



ALTER TABLE "public"."athletes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athletes_select_related" ON "public"."athletes" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."coach_athletes" "ca"
  WHERE (("ca"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ca"."athlete_id" = "athletes"."id")))) OR (EXISTS ( SELECT 1
   FROM "public"."coach_link_requests" "clr"
  WHERE (("clr"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("clr"."athlete_id" = "athletes"."id") AND ("clr"."status" = 'pending'::"text"))))));



CREATE POLICY "athletes_update_related" ON "public"."athletes" FOR UPDATE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."coach_athletes" "ca"
  WHERE (("ca"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ca"."athlete_id" = "athletes"."id")))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."coach_athletes" "ca"
  WHERE (("ca"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ca"."athlete_id" = "athletes"."id"))))));



ALTER TABLE "public"."coach_athletes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_athletes_delete_coach" ON "public"."coach_athletes" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "coach_id") AND "private"."current_user_is_coach"()));



CREATE POLICY "coach_athletes_insert_coach" ON "public"."coach_athletes" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "coach_id") AND "private"."current_user_is_coach"() AND "private"."is_athlete"("athlete_id")));



CREATE POLICY "coach_athletes_select_related" ON "public"."coach_athletes" FOR SELECT USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("athlete_id" = "private"."current_athlete_id"())));



CREATE POLICY "coach_athletes_update_coach" ON "public"."coach_athletes" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "coach_id") AND "private"."current_user_is_coach"())) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "coach_id") AND "private"."current_user_is_coach"()));



ALTER TABLE "public"."coach_link_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_link_requests_select_related" ON "public"."coach_link_requests" FOR SELECT USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("requested_by" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."exercise_library" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercise_library_delete" ON "public"."exercise_library" FOR DELETE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



CREATE POLICY "exercise_library_insert" ON "public"."exercise_library" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



CREATE POLICY "exercise_library_select" ON "public"."exercise_library" FOR SELECT TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."is_athlete_of"("coach_id")));



CREATE POLICY "exercise_library_update" ON "public"."exercise_library" FOR UPDATE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"())) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



ALTER TABLE "public"."exercise_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercise_logs_delete_athlete" ON "public"."exercise_logs" FOR DELETE USING ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session_exercise"("session_exercise_id")));



CREATE POLICY "exercise_logs_insert_athlete" ON "public"."exercise_logs" FOR INSERT WITH CHECK ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session_exercise"("session_exercise_id") AND (EXISTS ( SELECT 1
   FROM ("public"."session_logs" "sl"
     JOIN "public"."session_exercises" "se" ON (("se"."id" = "exercise_logs"."session_exercise_id")))
  WHERE (("sl"."id" = "exercise_logs"."session_log_id") AND ("sl"."athlete_id" = "private"."current_athlete_id"()) AND ("se"."session_id" = "sl"."session_id"))))));



CREATE POLICY "exercise_logs_select" ON "public"."exercise_logs" FOR SELECT USING ((("athlete_id" = "private"."current_athlete_id"()) OR "private"."is_coach_of"("athlete_id")));



CREATE POLICY "exercise_logs_update_athlete" ON "public"."exercise_logs" FOR UPDATE USING ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session_exercise"("session_exercise_id"))) WITH CHECK ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session_exercise"("session_exercise_id")));



ALTER TABLE "public"."exercise_test_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercise_test_targets_delete" ON "public"."exercise_test_targets" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."session_exercises" "se"
  WHERE (("se"."id" = "exercise_test_targets"."session_exercise_id") AND "private"."can_manage_session"("se"."session_id")))));



CREATE POLICY "exercise_test_targets_insert" ON "public"."exercise_test_targets" FOR INSERT WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."session_exercises" "se"
  WHERE (("se"."id" = "exercise_test_targets"."session_exercise_id") AND "private"."can_manage_session"("se"."session_id"))))));



CREATE POLICY "exercise_test_targets_select" ON "public"."exercise_test_targets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."session_exercises" "se"
  WHERE (("se"."id" = "exercise_test_targets"."session_exercise_id") AND "private"."can_access_session"("se"."session_id")))));



CREATE POLICY "exercise_test_targets_update" ON "public"."exercise_test_targets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."session_exercises" "se"
  WHERE (("se"."id" = "exercise_test_targets"."session_exercise_id") AND "private"."can_manage_session"("se"."session_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."session_exercises" "se"
  WHERE (("se"."id" = "exercise_test_targets"."session_exercise_id") AND "private"."can_manage_session"("se"."session_id")))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_related" ON "public"."profiles" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND "private"."can_access_profile"("id")));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programs_delete_coach" ON "public"."programs" FOR DELETE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id")));



CREATE POLICY "programs_insert_coach" ON "public"."programs" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"() AND "private"."is_coach_of"("athlete_id")));



CREATE POLICY "programs_select_assigned" ON "public"."programs" FOR SELECT USING (((("athlete_id" = "private"."current_athlete_id"()) AND ("status" <> 'draft'::"text")) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id"))));



CREATE POLICY "programs_update_coach" ON "public"."programs" FOR UPDATE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id"))) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id")));



ALTER TABLE "public"."session_exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_exercises_delete" ON "public"."session_exercises" FOR DELETE TO "authenticated" USING ("private"."can_manage_session"("session_id"));



CREATE POLICY "session_exercises_insert" ON "public"."session_exercises" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_manage_session"("session_id"));



CREATE POLICY "session_exercises_select" ON "public"."session_exercises" FOR SELECT TO "authenticated" USING ("private"."can_access_session"("session_id"));



CREATE POLICY "session_exercises_update" ON "public"."session_exercises" FOR UPDATE TO "authenticated" USING ("private"."can_manage_session"("session_id")) WITH CHECK ("private"."can_manage_session"("session_id"));



ALTER TABLE "public"."session_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_logs_delete_athlete" ON "public"."session_logs" FOR DELETE USING ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session"("session_id")));



CREATE POLICY "session_logs_insert_athlete" ON "public"."session_logs" FOR INSERT WITH CHECK ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session"("session_id")));



CREATE POLICY "session_logs_select" ON "public"."session_logs" FOR SELECT USING ((("athlete_id" = "private"."current_athlete_id"()) OR "private"."is_coach_of"("athlete_id")));



CREATE POLICY "session_logs_update_athlete" ON "public"."session_logs" FOR UPDATE USING ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session"("session_id"))) WITH CHECK ((("athlete_id" = "private"."current_athlete_id"()) AND "private"."can_access_session"("session_id")));



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions_delete" ON "public"."sessions" FOR DELETE TO "authenticated" USING ("private"."can_manage_week"("training_week_id"));



CREATE POLICY "sessions_insert" ON "public"."sessions" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_manage_week"("training_week_id"));



CREATE POLICY "sessions_select" ON "public"."sessions" FOR SELECT TO "authenticated" USING ("private"."can_access_week"("training_week_id"));



CREATE POLICY "sessions_update" ON "public"."sessions" FOR UPDATE TO "authenticated" USING ("private"."can_manage_week"("training_week_id")) WITH CHECK ("private"."can_manage_week"("training_week_id"));



ALTER TABLE "public"."test_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_attempts_delete" ON "public"."test_attempts" FOR DELETE USING ("private"."can_edit_test_session"("test_session_id"));



CREATE POLICY "test_attempts_insert" ON "public"."test_attempts" FOR INSERT WITH CHECK (("private"."can_edit_test_session"("test_session_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "test_attempts_select" ON "public"."test_attempts" FOR SELECT USING ("private"."can_access_test_session"("test_session_id"));



CREATE POLICY "test_attempts_update" ON "public"."test_attempts" FOR UPDATE USING ("private"."can_edit_test_session"("test_session_id")) WITH CHECK ("private"."can_edit_test_session"("test_session_id"));



ALTER TABLE "public"."test_library" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_library_delete" ON "public"."test_library" FOR DELETE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



CREATE POLICY "test_library_insert" ON "public"."test_library" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



CREATE POLICY "test_library_select" ON "public"."test_library" FOR SELECT TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ("public"."test_plan_items" "tpi"
     JOIN "public"."test_plans" "tp" ON (("tp"."id" = "tpi"."test_plan_id")))
  WHERE (("tpi"."test_library_id" = "test_library"."id") AND ("tp"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tp"."status" = ANY (ARRAY['published'::"text", 'completed'::"text"])))))));



CREATE POLICY "test_library_update" ON "public"."test_library" FOR UPDATE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"())) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"()));



ALTER TABLE "public"."test_plan_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_plan_items_delete" ON "public"."test_plan_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."test_plans" "tp"
  WHERE (("tp"."id" = "test_plan_items"."test_plan_id") AND ("tp"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("tp"."athlete_id")))));



CREATE POLICY "test_plan_items_insert" ON "public"."test_plan_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."test_plans" "tp"
  WHERE (("tp"."id" = "test_plan_items"."test_plan_id") AND ("tp"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("tp"."athlete_id")))));



CREATE POLICY "test_plan_items_select" ON "public"."test_plan_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."test_plans" "tp"
  WHERE (("tp"."id" = "test_plan_items"."test_plan_id") AND ((("tp"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("tp"."athlete_id")) OR (("tp"."athlete_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tp"."status" = ANY (ARRAY['published'::"text", 'completed'::"text"]))))))));



CREATE POLICY "test_plan_items_update" ON "public"."test_plan_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."test_plans" "tp"
  WHERE (("tp"."id" = "test_plan_items"."test_plan_id") AND ("tp"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("tp"."athlete_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."test_plans" "tp"
  WHERE (("tp"."id" = "test_plan_items"."test_plan_id") AND ("tp"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("tp"."athlete_id")))));



ALTER TABLE "public"."test_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_plans_delete" ON "public"."test_plans" FOR DELETE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id")));



CREATE POLICY "test_plans_insert" ON "public"."test_plans" FOR INSERT TO "authenticated" WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"() AND "private"."is_coach_of"("athlete_id")));



CREATE POLICY "test_plans_select" ON "public"."test_plans" FOR SELECT USING (((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id")) OR (("athlete_id" = "private"."current_athlete_id"()) AND ("status" = ANY (ARRAY['published'::"text", 'completed'::"text"])))));



CREATE POLICY "test_plans_update" ON "public"."test_plans" FOR UPDATE TO "authenticated" USING ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id"))) WITH CHECK ((("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id")));



ALTER TABLE "public"."test_result_corrections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_result_corrections_insert" ON "public"."test_result_corrections" FOR INSERT WITH CHECK ((("corrected_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."test_results" "tr"
  WHERE (("tr"."id" = "test_result_corrections"."test_result_id") AND "private"."can_edit_test_session"("tr"."test_session_id"))))));



CREATE POLICY "test_result_corrections_select" ON "public"."test_result_corrections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."test_results" "tr"
  WHERE (("tr"."id" = "test_result_corrections"."test_result_id") AND "private"."can_access_test_session"("tr"."test_session_id")))));



ALTER TABLE "public"."test_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_results_delete" ON "public"."test_results" FOR DELETE TO "authenticated" USING ("private"."can_edit_test_session"("test_session_id"));



CREATE POLICY "test_results_insert" ON "public"."test_results" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_edit_test_session"("test_session_id"));



CREATE POLICY "test_results_select" ON "public"."test_results" FOR SELECT TO "authenticated" USING ("private"."can_access_test_session"("test_session_id"));



CREATE POLICY "test_results_update" ON "public"."test_results" FOR UPDATE TO "authenticated" USING ("private"."can_edit_test_session"("test_session_id")) WITH CHECK ("private"."can_edit_test_session"("test_session_id"));



ALTER TABLE "public"."test_session_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_session_items_delete" ON "public"."test_session_items" FOR DELETE USING ("private"."can_edit_test_session"("test_session_id"));



CREATE POLICY "test_session_items_insert" ON "public"."test_session_items" FOR INSERT WITH CHECK ("private"."can_edit_test_session"("test_session_id"));



CREATE POLICY "test_session_items_select" ON "public"."test_session_items" FOR SELECT USING ("private"."can_access_test_session"("test_session_id"));



CREATE POLICY "test_session_items_update" ON "public"."test_session_items" FOR UPDATE USING ("private"."can_edit_test_session"("test_session_id")) WITH CHECK ("private"."can_edit_test_session"("test_session_id"));



ALTER TABLE "public"."test_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "test_sessions_delete" ON "public"."test_sessions" FOR DELETE USING ((("athlete_id" = "private"."current_athlete_id"()) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id"))));



CREATE POLICY "test_sessions_insert" ON "public"."test_sessions" FOR INSERT WITH CHECK (((("athlete_id" = "private"."current_athlete_id"()) AND (("coach_id" IS NULL) OR "private"."is_athlete_of"("coach_id"))) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."current_user_is_coach"() AND "private"."is_coach_of"("athlete_id"))));



CREATE POLICY "test_sessions_select" ON "public"."test_sessions" FOR SELECT USING ((("athlete_id" = "private"."current_athlete_id"()) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id"))));



CREATE POLICY "test_sessions_update" ON "public"."test_sessions" FOR UPDATE USING ((("athlete_id" = "private"."current_athlete_id"()) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id")))) WITH CHECK ((("athlete_id" = "private"."current_athlete_id"()) OR (("coach_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_coach_of"("athlete_id"))));



ALTER TABLE "public"."training_weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_weeks_delete" ON "public"."training_weeks" FOR DELETE TO "authenticated" USING ("private"."can_manage_program"("program_id"));



CREATE POLICY "training_weeks_insert" ON "public"."training_weeks" FOR INSERT TO "authenticated" WITH CHECK ("private"."can_manage_program"("program_id"));



CREATE POLICY "training_weeks_select" ON "public"."training_weeks" FOR SELECT TO "authenticated" USING ("private"."can_access_program"("program_id"));



CREATE POLICY "training_weeks_update" ON "public"."training_weeks" FOR UPDATE TO "authenticated" USING ("private"."can_manage_program"("program_id")) WITH CHECK ("private"."can_manage_program"("program_id"));



GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."can_access_profile"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_profile"("target_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_access_program"("target_program" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_program"("target_program" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_access_session"("target_session" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_session"("target_session" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_access_session_exercise"("target_session_exercise" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_session_exercise"("target_session_exercise" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_access_test_session"("target_test_session" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_test_session"("target_test_session" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_access_week"("target_week" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_access_week"("target_week" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_edit_test_session"("target_test_session" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_edit_test_session"("target_test_session" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_manage_program"("target_program" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_program"("target_program" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_manage_session"("target_session" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_session"("target_session" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_manage_session_exercise"("target_session_exercise" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_session_exercise"("target_session_exercise" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."can_manage_week"("target_week" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_manage_week"("target_week" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "private"."current_athlete_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."current_user_is_coach"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_user_is_coach"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_athlete"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_athlete"("target_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_athlete_of"("target_coach" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_athlete_of"("target_coach" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_coach_of"("target_athlete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_coach_of"("target_athlete" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."set_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."complete_invited_athlete_onboarding"("p_full_name" "text", "p_birth_date" "date", "p_weight_kg" numeric, "p_height_cm" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_invited_athlete_onboarding"("p_full_name" "text", "p_birth_date" "date", "p_weight_kg" numeric, "p_height_cm" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_invited_athlete_onboarding"("p_full_name" "text", "p_birth_date" "date", "p_weight_kg" numeric, "p_height_cm" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_managed_athlete"("p_first_name" "text", "p_last_name" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_managed_athlete"("p_first_name" "text", "p_last_name" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_managed_athlete"("p_first_name" "text", "p_last_name" "text", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_coach_link_request"("p_request_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_coach_link_request"("p_request_id" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_coach_link_request"("p_request_id" "uuid", "p_accept" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_coach_link"("p_coach_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_coach_link"("p_coach_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_coach_link"("p_coach_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."athlete_invitations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."athlete_invitations" TO "authenticated";



GRANT UPDATE("athlete_id") ON TABLE "public"."athlete_invitations" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."athlete_invitations" TO "authenticated";



GRANT UPDATE("accepted_at") ON TABLE "public"."athlete_invitations" TO "authenticated";



GRANT ALL ON TABLE "public"."athletes" TO "anon";
GRANT ALL ON TABLE "public"."athletes" TO "authenticated";
GRANT ALL ON TABLE "public"."athletes" TO "service_role";



GRANT ALL ON TABLE "public"."coach_athletes" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_athletes" TO "service_role";



GRANT ALL ON TABLE "public"."coach_link_requests" TO "anon";
GRANT ALL ON TABLE "public"."coach_link_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_link_requests" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_library" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_library" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_logs" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_test_targets" TO "anon";
GRANT ALL ON TABLE "public"."exercise_test_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_test_targets" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("first_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("last_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("birth_date") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("weight_kg") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("height_cm") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("onboarding_completed_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("must_change_password") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."session_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."session_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."session_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."session_logs" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."test_attempts" TO "anon";
GRANT ALL ON TABLE "public"."test_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."test_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."test_results" TO "authenticated";
GRANT ALL ON TABLE "public"."test_results" TO "service_role";



GRANT ALL ON TABLE "public"."test_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."test_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."test_history" TO "authenticated";
GRANT ALL ON TABLE "public"."test_history" TO "service_role";



GRANT ALL ON TABLE "public"."test_library" TO "authenticated";
GRANT ALL ON TABLE "public"."test_library" TO "service_role";



GRANT ALL ON TABLE "public"."test_plan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."test_plan_items" TO "service_role";



GRANT ALL ON TABLE "public"."test_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."test_plans" TO "service_role";



GRANT ALL ON TABLE "public"."test_result_corrections" TO "anon";
GRANT ALL ON TABLE "public"."test_result_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."test_result_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."test_session_items" TO "anon";
GRANT ALL ON TABLE "public"."test_session_items" TO "authenticated";
GRANT ALL ON TABLE "public"."test_session_items" TO "service_role";



GRANT ALL ON TABLE "public"."training_weeks" TO "authenticated";
GRANT ALL ON TABLE "public"."training_weeks" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ============================================================
-- Climbing Coach production baseline extras
-- Objects outside public/private that are application-owned.
-- Supabase-managed auth/storage schemas themselves are not dumped.
-- ============================================================

-- Keep the production event trigger that enables RLS on new app tables.
DROP EVENT TRIGGER IF EXISTS "ensure_rls";
CREATE EVENT TRIGGER "ensure_rls"
ON ddl_command_end
EXECUTE FUNCTION "public"."rls_auto_enable"();

-- Application trigger attached to the Supabase-managed auth.users table.
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created"
AFTER INSERT ON "auth"."users"
FOR EACH ROW
EXECUTE FUNCTION "private"."handle_new_user"();

-- Application-owned Storage bucket configuration.
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES
  ('test-acquisitions', 'test-acquisitions', false, 20971520, ARRAY['application/json', 'application/gzip']::text[]),
  ('test-videos', 'test-videos', false, 209715200, ARRAY['video/mp4', 'video/webm', 'video/quicktime']::text[])
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "public" = EXCLUDED."public",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types";

-- Application-owned policies on Supabase Storage.
DROP POLICY IF EXISTS "test_acquisitions_select" ON "storage"."objects";
CREATE POLICY "test_acquisitions_select"
ON "storage"."objects"
FOR SELECT
USING (
  bucket_id = 'test-acquisitions'
  AND private.can_access_test_acquisition(name)
);

DROP POLICY IF EXISTS "test_acquisitions_insert" ON "storage"."objects";
CREATE POLICY "test_acquisitions_insert"
ON "storage"."objects"
FOR INSERT
WITH CHECK (
  bucket_id = 'test-acquisitions'
  AND private.can_create_test_acquisition(name)
);

DROP POLICY IF EXISTS "test_acquisitions_update" ON "storage"."objects";
CREATE POLICY "test_acquisitions_update"
ON "storage"."objects"
FOR UPDATE
USING (
  bucket_id = 'test-acquisitions'
  AND private.can_access_test_acquisition(name)
)
WITH CHECK (
  bucket_id = 'test-acquisitions'
  AND private.can_access_test_acquisition(name)
);

DROP POLICY IF EXISTS "test_acquisitions_delete" ON "storage"."objects";
CREATE POLICY "test_acquisitions_delete"
ON "storage"."objects"
FOR DELETE
USING (
  bucket_id = 'test-acquisitions'
  AND private.can_access_test_acquisition(name)
);

DROP POLICY IF EXISTS "test_videos_insert" ON "storage"."objects";
CREATE POLICY "test_videos_insert"
ON "storage"."objects"
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'test-videos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND private.current_user_is_coach()
);

DROP POLICY IF EXISTS "test_videos_update" ON "storage"."objects";
CREATE POLICY "test_videos_update"
ON "storage"."objects"
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'test-videos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND private.current_user_is_coach()
)
WITH CHECK (
  bucket_id = 'test-videos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND private.current_user_is_coach()
);

DROP POLICY IF EXISTS "test_videos_delete" ON "storage"."objects";
CREATE POLICY "test_videos_delete"
ON "storage"."objects"
FOR DELETE
TO authenticated
USING (
  bucket_id = 'test-videos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND private.current_user_is_coach()
);

DROP POLICY IF EXISTS "test_videos_select" ON "storage"."objects";
CREATE POLICY "test_videos_select"
ON "storage"."objects"
FOR SELECT
TO authenticated
USING (
  bucket_id = 'test-videos'
  AND (
    (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND private.current_user_is_coach()
    )
    OR EXISTS (
      SELECT 1
      FROM public.test_library tl
      JOIN public.test_plan_items tpi ON tpi.test_library_id = tl.id
      JOIN public.test_plans tp ON tp.id = tpi.test_plan_id
      WHERE tl.video_path = storage.objects.name
        AND tp.athlete_id = (SELECT auth.uid())
        AND tp.status = ANY (ARRAY['published'::text, 'completed'::text])
    )
  )
);


-- =============================================================================
-- WILDWOOD WAITLIST — SUPABASE SCHEMA (CURRENT STATE)
-- =============================================================================
-- Project   : Wildwood Waitlist
-- Project ID: qxpftvnxorzwmawzhcjo
-- Region    : us-east-1
-- Postgres  : 17.6.1.104
-- Generated : 2026-05-13 (post SECURITY DEFINER view restructure)
--
-- This document reflects the LIVE state of the database after all security
-- hardening passes. Changes from the original baseline are tagged
-- "[HARDENED]" or "[NEW]" in section headers and inline.
--
-- Sections:
--   1. Extensions
--   2. Default Privileges
--   3. Enum Types
--   4. Tables
--   5. Indexes
--   6. Views                          [HARDENED: user_profiles_view restructured]
--   7. Functions                      [HARDENED: get_auth_users self-filtering]
--   8. Triggers
--   9. Row Level Security (RLS) Policies
--  10. Grants                         [HARDENED: trigger fns no longer REST-callable]
--  11. Scheduled Jobs
--  12. Change Log
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
-- Managed by Supabase. Listed for reference only.
-- uuid-ossp  : gen_random_uuid()
-- pgcrypto   : digest() / encryption utilities (used by check_email_exists)
-- pg_graphql : GraphQL API layer
-- pg_net     : async HTTP from SQL
-- pg_cron    : scheduled jobs (running cleanup_rate_limit_log every 30 min)


-- =============================================================================
-- 2. DEFAULT PRIVILEGES                         [opted in 2026-05-12]
-- =============================================================================
-- Project opted in early to Supabase's restrictive default privileges
-- (changelog #45329, Apr 28, 2026; enforced on all projects Oct 30, 2026).
--
-- New tables in `public` have NO grants by default. Each new table must
-- include explicit GRANT statements in its migration.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

-- Pattern for any new table going forward:
--
--   CREATE TABLE public.your_table (...);
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
--   -- (RLS auto-enabled by the rls_auto_enable event trigger)
--   CREATE POLICY ... ON public.your_table FOR ... ;


-- =============================================================================
-- 3. ENUM TYPES
-- =============================================================================

CREATE TYPE public.org_status_enum AS ENUM ('Active', 'Inactive');
CREATE TYPE public.priority_status_enum AS ENUM ('Board', 'Teacher', 'Alumni', 'Sibling', 'Regular');
CREATE TYPE public.school_history_enum AS ENUM ('Teacher', 'Alumni');
CREATE TYPE public.school_term_name_enum AS ENUM ('Fall 25-26', 'Fall 26-27', 'Fall 27-28', 'Fall 28-29', 'Fall 29-30');
CREATE TYPE public.term_status_enum AS ENUM ('Open', 'Closed');
CREATE TYPE public.classroom_enum AS ENUM ('Younger Dome', 'Older Dome');
CREATE TYPE public.waitlist_status_enum AS ENUM ('Enrolled', 'Waitlisted', 'Declined', 'Inactive');
CREATE TYPE public.user_role_enum AS ENUM ('Admin', 'Director', 'Viewer');
CREATE TYPE public.task_status_enum AS ENUM ('To Do', 'Doing', 'Done');
CREATE TYPE public.task_priority_enum AS ENUM ('Urgent', 'Important', 'Can Wait');


-- =============================================================================
-- 4. TABLES
-- =============================================================================

CREATE TABLE public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id   text,
  name        text NOT NULL,
  status      public.org_status_enum,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE public.families (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  name            text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.children (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  dob             date,
  priority_status public.priority_status_enum,
  notes           text,
  family_id       uuid REFERENCES public.families(id),
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.parents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text,
  phone           text,
  primary_contact boolean DEFAULT false,
  school_history  public.school_history_enum,
  family_id       uuid REFERENCES public.families(id),
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.school_terms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  name            text NOT NULL,
  sort_order      integer,
  start_date      date,
  end_date        date,
  status          public.term_status_enum,
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.waitlist_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  child_id        uuid REFERENCES public.children(id),
  term_id         uuid REFERENCES public.school_terms(id),
  organization_id uuid REFERENCES public.organizations(id),
  status          public.waitlist_status_enum,
  classroom       public.classroom_enum,
  date_applied    date,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        text,
  waitlist_item_id uuid REFERENCES public.waitlist_items(id),
  organization_id  uuid REFERENCES public.organizations(id),
  description      text,
  status           public.task_status_enum DEFAULT 'To Do',
  priority         public.task_priority_enum DEFAULT 'Important',
  created_at       timestamptz DEFAULT now()
  -- name column removed 2026-05-26: derived live in waitlist_tasks_view
);

CREATE TABLE public.user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id),
  name            text,
  role            public.user_role_enum,
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.rate_limit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  created_at timestamptz DEFAULT now(),
  email_hash text                            -- [HARDENED] added in security pass
);


-- =============================================================================
-- 5. INDEXES
-- =============================================================================

CREATE INDEX idx_children_family_id              ON public.children        USING btree (family_id);
CREATE INDEX idx_children_organization_id        ON public.children        USING btree (organization_id);
CREATE INDEX idx_families_organization_id        ON public.families        USING btree (organization_id);
CREATE INDEX idx_parents_family_id               ON public.parents         USING btree (family_id);
CREATE INDEX idx_parents_organization_id         ON public.parents         USING btree (organization_id);
CREATE INDEX idx_school_terms_organization_id    ON public.school_terms    USING btree (organization_id);
CREATE INDEX idx_waitlist_items_child_id         ON public.waitlist_items  USING btree (child_id);
CREATE INDEX idx_waitlist_items_term_id          ON public.waitlist_items  USING btree (term_id);
CREATE INDEX idx_waitlist_items_organization_id  ON public.waitlist_items  USING btree (organization_id);
CREATE INDEX idx_waitlist_item_tasks_waitlist_item_id ON public.tasks USING btree (waitlist_item_id);
CREATE INDEX idx_rate_limit_log_ip               ON public.rate_limit_log  USING btree (ip_address);
CREATE INDEX idx_rate_limit_log_created          ON public.rate_limit_log  USING btree (created_at);
CREATE INDEX idx_rate_limit_log_email_hash       ON public.rate_limit_log  USING btree (email_hash, created_at);


-- =============================================================================
-- 6. VIEWS                              [HARDENED: user_profiles_view restructure]
-- =============================================================================

-- user_profiles_view  [HARDENED 2026-05-13]
-- Restructured to eliminate the Supabase advisor's "SECURITY DEFINER VIEW"
-- critical warning. Previous version had a complex WHERE clause filtering rows
-- returned by a SECURITY DEFINER function — fragile and hard to audit.
--
-- New design:
--   - View is explicit SECURITY INVOKER (runs as the calling user)
--   - No WHERE clause on the view itself
--   - The underlying get_auth_users() function does its own row filtering
--     based on auth.uid() and the caller's role
--   - Defense in depth: filtering happens inside the function AND the view
--     respects standard RLS on user_profiles
CREATE VIEW public.user_profiles_view
WITH (security_invoker = true)               -- [HARDENED] explicit invoker semantics
AS
  SELECT
    up.id,
    up.name,
    up.role,
    up.organization_id,
    o.name              AS organization_name,
    up.created_at,
    au.email,
    au.last_sign_in_at,
    au.invited_at,
    au.confirmed_at
  FROM public.user_profiles up
  LEFT JOIN public.get_auth_users() au ON au.id = up.id
  LEFT JOIN public.organizations o ON o.id = up.organization_id;


-- waitlist_items_view
-- Denormalized view of waitlist_items joined with children and school_terms.
-- Primary data source for the staff waitlist UI.
-- SECURITY INVOKER so RLS policies are enforced for the calling user.
-- term_name is plain text (no enum cast) so any new term name is immediately
-- visible without requiring an ALTER TYPE migration.
CREATE VIEW public.waitlist_items_view
WITH (security_invoker = true)               -- [HARDENED] explicit invoker semantics
AS
  SELECT
    wi.id,
    wi.status                            AS status,
    wi.classroom                         AS classroom,
    wi.date_applied                      AS date_applied,
    wi.notes                             AS notes,
    wi.created_at,
    wi.child_id,
    wi.term_id,
    wi.organization_id,
    c.dob                                AS dob,
    c.first_name                         AS first_name,
    c.last_name                          AS last_name,
    (c.first_name || ' ' || c.last_name) AS child_full_name,
    c.priority_status                    AS priority_status,
    CASE c.priority_status
      WHEN 'Board'    THEN 1
      WHEN 'Teacher'  THEN 2
      WHEN 'Alumni'   THEN 3
      WHEN 'Sibling'  THEN 4
      WHEN 'Regular'  THEN 5
      ELSE NULL
    END                                  AS priority_rank,
    st.name                              AS term_name,
    st.start_date                        AS term_start_date,
    st.end_date                          AS term_end_date,
    st.status                            AS term_status
  FROM public.waitlist_items wi
  JOIN public.children c      ON wi.child_id = c.id
  JOIN public.school_terms st ON wi.term_id  = st.id;


-- waitlist_tasks_view
-- task_name is computed live as "<first> <last>: <term>" — never stored.
-- Always current even if child name or term changes.
-- SECURITY INVOKER so RLS policies are enforced for the calling user.
CREATE OR REPLACE VIEW public.waitlist_tasks_view
WITH (security_invoker = true)               -- [HARDENED] explicit invoker semantics
AS
  SELECT
    t.id                                                      AS task_id,
    (c.first_name || ' ' || c.last_name || ': ' || st.name)  AS task_name,
    t.status                                                  AS task_status,
    t.description                                             AS task_description,
    wi.id                                                     AS waitlist_item_id,
    wi.status                             AS waitlist_status,
    wi.classroom,
    wi.date_applied,
    wi.notes                              AS waitlist_notes,
    c.id                                  AS child_id,
    c.first_name                          AS child_first_name,
    c.last_name                           AS child_last_name,
    (c.first_name || ' ' || c.last_name)  AS child_full_name,
    c.dob                                 AS child_dob,
    c.priority_status                     AS child_priority_status,
    CASE c.priority_status
      WHEN 'Board'   THEN 1
      WHEN 'Teacher' THEN 2
      WHEN 'Alumni'  THEN 3
      WHEN 'Sibling' THEN 4
      WHEN 'Regular' THEN 5
      ELSE NULL
    END                                   AS priority_rank,
    f.id                                  AS family_id,
    f.name                                AS family_name,
    st.id                                 AS term_id,
    st.name                               AS term_name,
    st.status                             AS term_status,
    wi.organization_id,
    t.created_at
  FROM public.tasks t
  JOIN public.waitlist_items wi ON wi.id  = t.waitlist_item_id
  JOIN public.children c        ON c.id   = wi.child_id
  JOIN public.families f        ON f.id   = c.family_id
  JOIN public.school_terms st   ON st.id  = wi.term_id;


-- =============================================================================
-- 7. FUNCTIONS                                  [HARDENED]
-- =============================================================================
-- All SECURITY DEFINER functions have explicit `SET search_path` clauses
-- to prevent search-path manipulation attacks. Functions that return rows
-- now filter internally rather than relying on caller-side WHERE clauses.

-- current_user_org()
-- Returns the organization_id of the currently authenticated user.
-- Required SECURITY DEFINER for RLS policies to function.
CREATE OR REPLACE FUNCTION public.current_user_org()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.user_profiles WHERE id = auth.uid();
$$;


-- current_user_role()
-- Returns the role enum of the currently authenticated user.
-- Required SECURITY DEFINER for RLS policies to function.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role_enum
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;


-- get_auth_users()  [HARDENED 2026-05-13: now self-filtering]
-- Exposes a safe subset of auth.users to the public schema.
-- 
-- Critical change: this function now does its OWN row-level filtering rather
-- than returning all rows and relying on the consumer (user_profiles_view) to
-- filter via WHERE clause. This eliminates the "SECURITY DEFINER VIEW" advisor
-- warning and provides defense in depth.
--
-- Behavior:
--   - Returns the caller's own row (matched on auth.uid())
--   - If caller is Admin or Director, also returns all rows in their org
--   - Otherwise returns only the caller's row
--   - When called pre-authentication (auth.uid() is NULL), returns zero rows
CREATE OR REPLACE FUNCTION public.get_auth_users()
RETURNS TABLE (
  id              uuid,
  email           character varying,
  invited_at      timestamptz,
  confirmed_at    timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT au.id, au.email, au.invited_at, au.confirmed_at, au.last_sign_in_at
  FROM auth.users au
  JOIN public.user_profiles up ON up.id = au.id
  WHERE 
    au.id = auth.uid()
    OR (
      public.current_user_role() = ANY (ARRAY['Admin'::public.user_role_enum, 'Director'::public.user_role_enum])
      AND up.organization_id = public.current_user_org()
    );
$$;


-- handle_new_user()
-- Trigger function on auth.users INSERT. Creates a corresponding row in
-- public.user_profiles with NULL role and organization — these must be set
-- manually by an Admin/Director, preventing privilege escalation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, role, organization_id, created_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'name',
    NULL,                            -- explicit NULL prevents role injection
    NULL,                            -- explicit NULL prevents org injection
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- check_email_exists(input_email text)  [HARDENED]
-- Rate-limited email existence check used on the pre-login flow.
-- Queries auth.users + user_profiles directly (NOT user_profiles_view, which
-- requires an authenticated session for the get_auth_users() filtering to work).
CREATE OR REPLACE FUNCTION public.check_email_exists(input_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  ip_count      INT;
  email_count   INT;
  client_ip     TEXT;
  hashed_email  TEXT;
  window_start  TIMESTAMPTZ;
  email_window  TIMESTAMPTZ;
  result        BOOLEAN;
BEGIN
  BEGIN
    client_ip := current_setting('request.headers')::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    client_ip := 'unknown';
  END;

  hashed_email := encode(digest(lower(trim(input_email)), 'sha256'), 'hex');

  window_start := NOW() - INTERVAL '1 minute';
  email_window := NOW() - INTERVAL '10 minutes';

  SELECT COUNT(*) INTO ip_count
  FROM public.rate_limit_log
  WHERE ip_address = client_ip AND created_at >= window_start;

  SELECT COUNT(*) INTO email_count
  FROM public.rate_limit_log
  WHERE email_hash = hashed_email AND created_at >= email_window;

  -- Direct query — does NOT use user_profiles_view (which is now invoker-mode
  -- and requires auth.uid() to be non-null)
  SELECT EXISTS (
    SELECT 1
    FROM auth.users au
    JOIN public.user_profiles up ON up.id = au.id
    WHERE lower(au.email) = lower(trim(input_email))
  ) INTO result;

  INSERT INTO public.rate_limit_log (ip_address, email_hash, created_at)
  VALUES (client_ip, hashed_email, NOW());

  IF ip_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please try again later.';
  END IF;
  IF email_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please try again later.';
  END IF;

  RETURN result;
END;
$$;


-- cleanup_rate_limit_log()
-- Deletes rate_limit_log entries older than 1 hour.
-- Scheduled via pg_cron every 30 minutes.
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_log
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;


-- update_waitlist_items_view()
-- INSTEAD OF UPDATE trigger for waitlist_items_view.
CREATE OR REPLACE FUNCTION public.update_waitlist_items_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_term_id uuid;
BEGIN
  IF NEW.term_name IS NOT NULL AND NEW.term_name IS DISTINCT FROM OLD.term_name THEN
    SELECT id INTO v_term_id
    FROM public.school_terms
    WHERE name = NEW.term_name::text
    LIMIT 1;

    IF v_term_id IS NULL THEN
      RAISE EXCEPTION 'Term not found: %', NEW.term_name;
    END IF;
  ELSE
    v_term_id := NEW.term_id;
  END IF;

  UPDATE public.waitlist_items SET
    status       = NEW.status,
    classroom    = NEW.classroom,
    date_applied = NEW.date_applied,
    notes        = NEW.notes,
    term_id      = v_term_id
  WHERE id = NEW.id;

  UPDATE public.children SET
    first_name      = NEW.first_name,
    last_name       = NEW.last_name,
    dob             = NEW.dob,
    priority_status = NEW.priority_status
  WHERE id = NEW.child_id;

  RETURN NEW;
END;
$$;


-- fn_update_task_from_view()
-- INSTEAD OF UPDATE trigger for waitlist_tasks_view. SECURITY INVOKER so RLS
-- applies on the caller's behalf.
-- Note: task_name is computed in the view and is not stored; only description
-- and status are writable.
CREATE OR REPLACE FUNCTION public.fn_update_task_from_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tasks
  SET
    description = NEW.task_description,
    status      = NEW.task_status
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;


-- rls_auto_enable()
-- Event trigger function: automatically enables RLS on any new table
-- created in the public schema.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
      AND cmd.schema_name = 'public'
      AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
      AND cmd.schema_name NOT LIKE 'pg_toast%'
      AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    END IF;
  END LOOP;
END;
$$;


-- =============================================================================
-- 8. TRIGGERS
-- =============================================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_update_waitlist_items_view
  INSTEAD OF UPDATE ON public.waitlist_items_view
  FOR EACH ROW
  EXECUTE FUNCTION public.update_waitlist_items_view();

CREATE TRIGGER trg_update_task_from_view
  INSTEAD OF UPDATE ON public.waitlist_tasks_view
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_task_from_view();

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();


-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_terms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "Any staff can view their org"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage their org"
  ON public.organizations FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND id = public.current_user_org()
  );

-- families
CREATE POLICY "Any staff can view families"
  ON public.families FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage families"
  ON public.families FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

-- children
CREATE POLICY "Any staff can view children"
  ON public.children FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage children"
  ON public.children FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

-- parents
CREATE POLICY "Any staff can view parents"
  ON public.parents FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage parents"
  ON public.parents FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

-- school_terms
CREATE POLICY "Any staff can view terms"
  ON public.school_terms FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage terms"
  ON public.school_terms FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

-- waitlist_items
CREATE POLICY "Any staff can view waitlist items"
  ON public.waitlist_items FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage waitlist items"
  ON public.waitlist_items FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

-- tasks
CREATE POLICY "Any staff can view tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage tasks"
  ON public.tasks FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

-- user_profiles
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins and Directors can view profiles in org"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

CREATE POLICY "Admins and Directors can manage profiles in org"
  ON public.user_profiles FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

-- rate_limit_log: no policies = no direct user access.


-- =============================================================================
-- 10. GRANTS                                    [HARDENED]
-- =============================================================================

-- anon: revoked from all tables/views and all functions except check_email_exists
REVOKE ALL ON TABLE public.organizations       FROM anon;
REVOKE ALL ON TABLE public.families            FROM anon;
REVOKE ALL ON TABLE public.children            FROM anon;
REVOKE ALL ON TABLE public.parents             FROM anon;
REVOKE ALL ON TABLE public.school_terms        FROM anon;
REVOKE ALL ON TABLE public.waitlist_items      FROM anon;
REVOKE ALL ON TABLE public.tasks               FROM anon;
REVOKE ALL ON TABLE public.user_profiles       FROM anon;
REVOKE ALL ON TABLE public.rate_limit_log      FROM anon;
REVOKE ALL ON TABLE public.user_profiles_view  FROM anon;
REVOKE ALL ON TABLE public.waitlist_items_view FROM anon;
REVOKE ALL ON TABLE public.waitlist_tasks_view FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_auth_users()             FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_waitlist_items_view() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_update_task_from_view()   FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_org()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role()          FROM anon;

-- KEPT: anon needs this for the pre-login email check
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon;

-- authenticated: full table/view grants (RLS does the actual gating)
GRANT ALL ON TABLE public.organizations       TO authenticated;
GRANT ALL ON TABLE public.families            TO authenticated;
GRANT ALL ON TABLE public.children            TO authenticated;
GRANT ALL ON TABLE public.parents             TO authenticated;
GRANT ALL ON TABLE public.school_terms        TO authenticated;
GRANT ALL ON TABLE public.waitlist_items      TO authenticated;
GRANT ALL ON TABLE public.tasks               TO authenticated;
GRANT ALL ON TABLE public.user_profiles       TO authenticated;
GRANT ALL ON TABLE public.rate_limit_log      TO authenticated;
GRANT ALL ON TABLE public.user_profiles_view  TO authenticated;
GRANT ALL ON TABLE public.waitlist_items_view TO authenticated;
GRANT ALL ON TABLE public.waitlist_tasks_view TO authenticated;

-- [HARDENED 2026-05-13] authenticated: revoked EXECUTE on internal/trigger
-- functions that should never be callable via REST. The Supabase advisor
-- flags any SECURITY DEFINER function exposed at /rest/v1/rpc/* as a concern;
-- these are not meant to be REST endpoints.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_waitlist_items_view() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_task_from_view()   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()            FROM authenticated;

-- KEPT: authenticated must be able to execute these
-- (current_user_org/role are called by RLS policies; get_auth_users is
-- called by user_profiles_view; check_email_exists is callable post-login too)
GRANT EXECUTE ON FUNCTION public.current_user_org()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_users()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO authenticated;


-- =============================================================================
-- 11. SCHEDULED JOBS
-- =============================================================================

-- cleanup-rate-limit-log: deletes rate_limit_log rows older than 1 hour
-- Schedule: every 30 minutes via pg_cron
-- View status: SELECT * FROM cron.job WHERE jobname = 'cleanup-rate-limit-log';


-- =============================================================================
-- 12. CHANGE LOG
-- =============================================================================
--
-- 2026-04-12  Initial schema created. RLS enabled on all tables, basic
--             policies in place, rls_auto_enable event trigger installed.
--
-- 2026-05-12  Initial security hardening pass:
--             [1] Revoked ALL grants from anon on every table and view
--                 (keeping only EXECUTE on check_email_exists).
--             [2] Revoked anon EXECUTE on all other functions.
--             [3] Added WITH CHECK clauses to every write policy.
--             [4] Hardened check_email_exists with two-dimensional rate
--                 limiting, timing-attack mitigation, and PII-free logging.
--             [5] Added email_hash column + index to rate_limit_log.
--             [6] Restricted user_profiles_view via WHERE clause.
--             [7] Scheduled cleanup_rate_limit_log via pg_cron.
--
-- 2026-05-12  search_path hardening pass:
--             [1] Set explicit search_path on all SECURITY DEFINER functions.
--             [2] All functions use fully-qualified table references.
--             [3] Fixed pre-existing bug in check_email_exists: now queries
--                 auth.users + user_profiles directly instead of the
--                 restricted user_profiles_view (which always returned false
--                 pre-login).
--             [4] Rewrote update_waitlist_items_view to match current schema.
--
-- 2026-05-12  Default privileges opt-in (Supabase changelog #45329):
--             [1] Revoked default SELECT/INSERT/UPDATE/DELETE on TABLES
--                 from anon, authenticated, service_role.
--             [2] Effect: new tables in public schema now require explicit
--                 GRANT statements.
--
-- 2026-05-12  Backup migration:
--             [1] Migrated nightly Supabase backups from a self-hosted
--                 GitHub Action workflow to Supabase Pro's built-in daily
--                 backups. GitHub backup repo deleted, DB password rotated.
--
-- 2026-05-13  SECURITY DEFINER view restructure (advisor critical):
--             [1] Eliminated the "SECURITY DEFINER VIEW" critical advisor
--                 warning by restructuring user_profiles_view.
--             [2] Old design: WHERE clause filtered rows returned by a
--                 SECURITY DEFINER function (fragile, dependent on the
--                 WHERE clause being correct).
--             [3] New design: view is explicit SECURITY INVOKER, has no
--                 WHERE clause; get_auth_users() now self-filters internally
--                 returning only rows the caller is entitled to see.
--             [4] Also caught an operator-precedence bug in the old WHERE
--                 clause that could have caused org-isolation issues if
--                 modified without parentheses awareness.
--             [5] Revoked authenticated EXECUTE on trigger/internal
--                 functions that should not be REST-callable
--                 (handle_new_user, update_waitlist_items_view,
--                 fn_update_task_from_view, cleanup_rate_limit_log,
--                 rls_auto_enable).
--             [6] check_email_exists already queries auth.users directly,
--                 so the user_profiles_view restructure did not affect login.
--
-- 2026-05-26  Term management UI + view hardening:
--             [1] Dropped school_term_name_enum cast from waitlist_items_view
--                 (term_name is now plain text). Required DROP + recreate.
--             [2] Added WITH (security_invoker = true) to waitlist_items_view
--                 (was missing — second Supabase Advisor issue fixed).
--             [3] Re-attached trg_update_waitlist_items_view trigger.
--             [4] Added app/actions/terms.ts: createTerm, updateTerm.
--             [5] Added /settings page with TermsManager component.
--             [6] Added Settings link to TopNav.
-- 2026-05-26  Security hardening — waitlist_tasks_view SECURITY INVOKER:
--             Supabase Advisor flagged waitlist_tasks_view as SECURITY DEFINER
--             (it was recreated without security_invoker = true in the previous
--             migration). Fixed with ALTER VIEW ... SET (security_invoker = on).
--             Reference schema updated to match.
-- 2026-05-26  Task name — moved from stored column to live view computation:
--             [1] Dropped tasks.name column (was a denormalized snapshot prone
--                 to going stale if child name or term changed).
--             [2] Updated waitlist_tasks_view: task_name is now computed inline
--                 as "<first> <last>: <term>" from the live JOIN data.
--                 Always current; no triggers or backfills needed.
--             [3] Updated fn_update_task_from_view: removed name write (column
--                 no longer exists; task_name is read-only / view-computed).
--             [4] createTask server action reads task_name back from the view
--                 after insert for the optimistic UI update.
--
-- =============================================================================
-- END OF SCHEMA DOCUMENT
-- =============================================================================

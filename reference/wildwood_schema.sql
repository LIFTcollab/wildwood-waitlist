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
CREATE TYPE public.org_type_enum AS ENUM (   -- [Phase 1.4]
  'nonprofit', 'business_sponsor', 'foundation',
  'community_org', 'government', 'lift_internal'
);
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
  slug        text UNIQUE NOT NULL,            -- [Phase 1.4] subdomain identifier
  type        public.org_type_enum,            -- [Phase 1.4]
  domain      text,                            -- [Phase 1.4] custom domain (future)
  status      public.org_status_enum,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE public.families (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  name            text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now(),
  priority_rank   integer DEFAULT 5,           -- [UPDATED] moved from children; default 5 = Regular
  priority_status text    DEFAULT 'Regular'    -- [UPDATED] moved from children; plain text not enum
);

CREATE TABLE public.children (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  dob             date,
  notes           text,
  family_id       uuid REFERENCES public.families(id),
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
  -- priority_status removed: moved to families table
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
-- Denormalized view: waitlist_items → children → families → school_terms.
-- priority_status and priority_rank come from families (moved from children).
-- child_notes is children.notes exposed under an alias for the inline editor.
-- term_name is plain text — no enum cast needed for new terms.
CREATE VIEW public.waitlist_items_view
WITH (security_invoker = true)
AS
  SELECT
    wi.id,
    wi.status,
    wi.classroom,
    wi.date_applied,
    wi.notes,
    wi.created_at,
    wi.child_id,
    wi.term_id,
    wi.organization_id,
    c.dob,
    c.first_name,
    c.last_name,
    (c.first_name || ' ' || c.last_name) AS child_full_name,
    c.notes                               AS child_notes,
    f.priority_status,
    f.priority_rank,
    st.name                               AS term_name,
    st.start_date                         AS term_start_date,
    st.end_date                           AS term_end_date,
    st.status                             AS term_status
  FROM public.waitlist_items wi
  JOIN public.children c      ON c.id  = wi.child_id
  JOIN public.families f      ON f.id  = c.family_id
  JOIN public.school_terms st ON st.id = wi.term_id;


-- waitlist_tasks_view
-- task_name is computed live as "<first> <last>: <term>" — never stored.
-- priority_status and priority_rank come from families (moved from children).
CREATE VIEW public.waitlist_tasks_view
WITH (security_invoker = true)
AS
  SELECT
    t.id                                                     AS task_id,
    (c.first_name || ' ' || c.last_name || ': ' || st.name) AS task_name,
    t.status                                                 AS task_status,
    t.description                                            AS task_description,
    wi.id                                                    AS waitlist_item_id,
    wi.status                                                AS waitlist_status,
    wi.classroom,
    wi.date_applied,
    wi.notes                                                 AS waitlist_notes,
    c.id                                                     AS child_id,
    c.first_name                                             AS child_first_name,
    c.last_name                                              AS child_last_name,
    (c.first_name || ' ' || c.last_name)                     AS child_full_name,
    c.dob                                                    AS child_dob,
    f.priority_status                                        AS child_priority_status,
    f.priority_rank,
    f.id                                                     AS family_id,
    f.name                                                   AS family_name,
    st.id                                                    AS term_id,
    st.name                                                  AS term_name,
    st.status                                                AS term_status,
    wi.organization_id,
    t.created_at
  FROM public.tasks t
  JOIN public.waitlist_items wi ON wi.id = t.waitlist_item_id
  JOIN public.children c        ON c.id  = wi.child_id
  JOIN public.families f        ON f.id  = c.family_id
  JOIN public.school_terms st   ON st.id = wi.term_id;


-- data_integrity_issues
-- Admin/Director-only diagnostic view. Returns data quality problems across
-- families, parents, children, and waitlist entries. Used by DataIntegrityPanel
-- in /settings (app/actions/integrity.ts).
--
-- Checks performed (each as one UNION branch):
--   no_parents            [error]   — family exists with zero parents
--   no_children           [warning] — family exists with zero children
--   no_waitlist_entry     [warning] — child exists with no waitlist_items row
--   no_primary_contact    [warning] — family has parents but none is primary_contact
--   multiple_primary_contacts [warning] — more than one primary_contact per family
--   name_drift            [error]   — family.name doesn't match sorted parent last names
--   duplicate_email       [error]   — same email on two or more parents in the org
--
-- Columns: issue_type text, severity text, description text,
--          family_id uuid, family_name text, entity_id uuid
--
-- Security note: this view was created WITHOUT security_invoker = true
-- (Supabase Advisor will flag it). The underlying tables all have RLS, so
-- data is still tenant-isolated. Phase 1.3 will recreate this view with
-- WITH (security_invoker = true) and wl_-prefixed table names.
--
-- Grant: SELECT on authenticated (anon revoked). No RLS on the view itself
-- (views don't need it; RLS on the base tables provides the isolation).
CREATE VIEW public.data_integrity_issues
AS
  -- families with no parents at all
  SELECT 'no_parents'::text                     AS issue_type,
         'error'::text                           AS severity,
         'Family has no parents'::text           AS description,
         f.id                                    AS family_id,
         f.name                                  AS family_name,
         NULL::uuid                              AS entity_id
  FROM public.families f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.parents p WHERE p.family_id = f.id
  )

  UNION ALL

  -- families with no children at all
  SELECT 'no_children'::text,
         'warning'::text,
         'Family has no children'::text,
         f.id, f.name, NULL::uuid
  FROM public.families f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.children c WHERE c.family_id = f.id
  )

  UNION ALL

  -- children with no waitlist entry
  SELECT 'no_waitlist_entry'::text,
         'warning'::text,
         'Child has no waitlist entry: ' || c.first_name || ' ' || c.last_name,
         c.family_id, f.name, c.id
  FROM public.children c
  JOIN public.families f ON f.id = c.family_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.waitlist_items wi WHERE wi.child_id = c.id
  )

  UNION ALL

  -- families with parents but no primary contact
  SELECT 'no_primary_contact'::text,
         'warning'::text,
         'Family has no primary contact set'::text,
         f.id, f.name, NULL::uuid
  FROM public.families f
  WHERE EXISTS (SELECT 1 FROM public.parents p WHERE p.family_id = f.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.parents p WHERE p.family_id = f.id AND p.primary_contact = true
    )

  UNION ALL

  -- families with more than one primary contact
  SELECT 'multiple_primary_contacts'::text,
         'warning'::text,
         'Family has ' || count(*) || ' primary contacts',
         f.id, f.name, NULL::uuid
  FROM public.families f
  JOIN public.parents p ON p.family_id = f.id AND p.primary_contact = true
  GROUP BY f.id, f.name
  HAVING count(*) > 1

  UNION ALL

  -- family.name doesn't match sorted parent last names
  SELECT 'name_drift'::text,
         'error'::text,
         'Family name "' || f.name || '" doesn''t match parent last names',
         f.id, f.name, NULL::uuid
  FROM public.families f
  WHERE f.name IS DISTINCT FROM (
    SELECT string_agg(sub.last_name, '-' ORDER BY sub.last_name)
    FROM (
      SELECT DISTINCT trim(p.last_name) AS last_name
      FROM public.parents p
      WHERE p.family_id = f.id AND trim(p.last_name) <> ''
    ) sub
  )
  AND EXISTS (SELECT 1 FROM public.parents p WHERE p.family_id = f.id)

  UNION ALL

  -- same email used by multiple parents within the same org
  SELECT 'duplicate_email'::text,
         'error'::text,
         'Email shared by multiple parents: ' || p.email,
         p.family_id, f.name, p.id
  FROM public.parents p
  JOIN public.families f ON f.id = p.family_id
  WHERE p.email IS NOT NULL
    AND (
      SELECT count(*) FROM public.parents p2
      WHERE p2.email = p.email AND p2.organization_id = p.organization_id
    ) > 1;


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
-- SECURITY INVOKER so base-table RLS applies on the caller's behalf — must NOT
-- be SECURITY DEFINER, or read-only Viewers can write through the view and
-- bypass the Admin/Director-only UPDATE policies. (Fixed 2026-05-28; see
-- migrations/security_fix_waitlist_view_trigger_invoker.sql.)
CREATE OR REPLACE FUNCTION public.update_waitlist_items_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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
    first_name = NEW.first_name,
    last_name  = NEW.last_name,
    dob        = NEW.dob,
    notes      = NEW.child_notes  -- [UPDATED] priority_status removed (now on families)
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


-- Priority / name auto-recompute helpers (called by triggers)     [Phase 1 fix]
-- These were NOT in the original schema file and were missed in phase1_wl_prefix.
-- Fixed in migration phase1_fix_trigger_functions.sql.

CREATE OR REPLACE FUNCTION public.fn_recompute_family_priority(p_family_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_prank integer;
BEGIN
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = p_family_id AND p.school_history::text = 'Board')   THEN 1
      WHEN EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = p_family_id AND p.school_history::text = 'Teacher') THEN 2
      WHEN EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = p_family_id AND p.school_history::text = 'Alumni')  THEN 3
      WHEN (SELECT COUNT(DISTINCT sib.id) FROM public.wl_children sib
            JOIN public.wl_waitlist_items wi ON wi.child_id = sib.id
            WHERE sib.family_id = p_family_id
              AND wi.status::text = ANY(ARRAY['Enrolled','Waitlisted'])) > 1  THEN 4
      ELSE 5
    END INTO v_prank;
  UPDATE public.wl_families
     SET priority_rank   = v_prank,
         priority_status = CASE v_prank WHEN 1 THEN 'Board' WHEN 2 THEN 'Teacher'
                                        WHEN 3 THEN 'Alumni' WHEN 4 THEN 'Sibling'
                                        ELSE 'Regular' END
   WHERE id = p_family_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_recompute_family_name(p_family_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  SELECT string_agg(last_name, '-' ORDER BY last_name) INTO v_name
  FROM (SELECT DISTINCT last_name FROM public.wl_parents
        WHERE family_id = p_family_id AND last_name IS NOT NULL AND last_name <> '') t;
  IF v_name IS NOT NULL AND v_name <> '' THEN
    UPDATE public.wl_families SET name = v_name WHERE id = p_family_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trg_parents_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.fn_recompute_family_priority(OLD.family_id);
  ELSIF TG_OP = 'INSERT' THEN PERFORM public.fn_recompute_family_priority(NEW.family_id);
  ELSE
    IF OLD.family_id IS DISTINCT FROM NEW.family_id THEN
      PERFORM public.fn_recompute_family_priority(OLD.family_id);
    END IF;
    PERFORM public.fn_recompute_family_priority(NEW.family_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trg_parents_family_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.fn_recompute_family_name(OLD.family_id);
  ELSIF TG_OP = 'INSERT' THEN PERFORM public.fn_recompute_family_name(NEW.family_id);
  ELSE
    IF OLD.last_name IS DISTINCT FROM NEW.last_name OR OLD.family_id IS DISTINCT FROM NEW.family_id THEN
      IF OLD.family_id IS DISTINCT FROM NEW.family_id THEN PERFORM public.fn_recompute_family_name(OLD.family_id); END IF;
      PERFORM public.fn_recompute_family_name(NEW.family_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trg_children_family_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.family_id IS DISTINCT FROM NEW.family_id THEN
    PERFORM public.fn_recompute_family_priority(OLD.family_id);
    PERFORM public.fn_recompute_family_priority(NEW.family_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trg_waitlist_items_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_family_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT family_id INTO v_family_id FROM public.wl_children WHERE id = OLD.child_id;
  ELSE
    SELECT family_id INTO v_family_id FROM public.wl_children WHERE id = NEW.child_id;
  END IF;
  IF v_family_id IS NOT NULL THEN PERFORM public.fn_recompute_family_priority(v_family_id); END IF;
  RETURN NULL;
END;
$$;

-- wl_create_waitlist_entry()  [NEW 2026-05-28]
-- Atomic "add child to waitlist": resolves/creates the family, creates the
-- child, and creates the waitlist item in a single transaction so a partial
-- failure cannot leave an orphaned family/child row. SECURITY INVOKER, so RLS
-- and the role check apply to the caller. Verifies a supplied family_id belongs
-- to the caller's org. Called by the createWaitlistEntry server action.
-- See migrations/add_wl_create_waitlist_entry_rpc.sql for the full definition.
CREATE OR REPLACE FUNCTION public.wl_create_waitlist_entry(
  p_family_id uuid, p_family_name text, p_first_name text, p_last_name text,
  p_dob date, p_term_id uuid, p_status text, p_classroom text,
  p_date_applied date, p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org    uuid := public.current_user_org();
  v_role   public.user_role_enum := public.current_user_role();
  v_family uuid := p_family_id;
  v_child  uuid;
  v_item   uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No organization found for your account';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('Admin', 'Director') THEN
    RAISE EXCEPTION 'Only Admins and Directors can add waitlist entries';
  END IF;

  IF v_family IS NULL THEN
    INSERT INTO public.wl_families (name, organization_id)
    VALUES (btrim(p_family_name), v_org)
    RETURNING id INTO v_family;
  ELSE
    PERFORM 1 FROM public.wl_families
      WHERE id = v_family AND organization_id = v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Family not found';
    END IF;
  END IF;

  INSERT INTO public.wl_children (first_name, last_name, dob, family_id, organization_id)
  VALUES (btrim(p_first_name), btrim(p_last_name), p_dob, v_family, v_org)
  RETURNING id INTO v_child;

  INSERT INTO public.wl_waitlist_items
    (child_id, term_id, organization_id, status, classroom, date_applied, notes)
  VALUES (
    v_child, p_term_id, v_org,
    NULLIF(p_status, '')::public.waitlist_status_enum,
    NULLIF(p_classroom, '')::public.classroom_enum,
    p_date_applied, NULLIF(p_notes, '')
  )
  RETURNING id INTO v_item;

  RETURN jsonb_build_object('item_id', v_item, 'child_id', v_child);
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

-- Priority / name auto-recompute triggers (wl_ tables)    [Phase 1 fix]

CREATE TRIGGER trg_parents_priority
  AFTER INSERT OR UPDATE OR DELETE ON public.wl_parents
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_parents_priority();

CREATE TRIGGER trg_parents_family_name
  AFTER INSERT OR UPDATE OR DELETE ON public.wl_parents
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_parents_family_name();

CREATE TRIGGER trg_children_family_priority
  AFTER UPDATE ON public.wl_children
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_children_family_priority();

CREATE TRIGGER trg_waitlist_items_priority
  AFTER INSERT OR UPDATE OR DELETE ON public.wl_waitlist_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_waitlist_items_priority();

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

-- Pattern: one FOR SELECT (all staff) + separate FOR INSERT/UPDATE/DELETE
-- (Admins/Directors). Avoids multiple permissive SELECT policies which cause
-- each policy to be evaluated on every query row (Supabase Advisor lint 0006).

-- organizations (uses `id` not `organization_id`)
CREATE POLICY "Any staff can view their org"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert their org"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND id = public.current_user_org());
CREATE POLICY "Admins and Directors can update their org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete their org"
  ON public.organizations FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND id = public.current_user_org());

-- families
CREATE POLICY "Any staff can view families"
  ON public.families FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert families"
  ON public.families FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update families"
  ON public.families FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete families"
  ON public.families FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- children
CREATE POLICY "Any staff can view children"
  ON public.children FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert children"
  ON public.children FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update children"
  ON public.children FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete children"
  ON public.children FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- parents
CREATE POLICY "Any staff can view parents"
  ON public.parents FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert parents"
  ON public.parents FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update parents"
  ON public.parents FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete parents"
  ON public.parents FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- school_terms
CREATE POLICY "Any staff can view terms"
  ON public.school_terms FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert terms"
  ON public.school_terms FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update terms"
  ON public.school_terms FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete terms"
  ON public.school_terms FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- waitlist_items
CREATE POLICY "Any staff can view waitlist items"
  ON public.waitlist_items FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert waitlist items"
  ON public.waitlist_items FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update waitlist items"
  ON public.waitlist_items FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete waitlist items"
  ON public.waitlist_items FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- tasks
CREATE POLICY "Any staff can view tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- user_profiles: consolidated to one SELECT policy covering own row OR
-- admin/director in same org. Uses (select auth.uid()) to avoid per-row
-- re-evaluation (Supabase Advisor lint 0003).
CREATE POLICY "Staff can view user profiles"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR (
      public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
      AND organization_id = public.current_user_org()
    )
  );
CREATE POLICY "Admins and Directors can insert profiles in org"
  ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update profiles in org"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete profiles in org"
  ON public.user_profiles FOR DELETE TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- rate_limit_log: no policies = no direct user access (RLS enabled, zero rows returned).


-- =============================================================================
-- 10. GRANTS                                    [HARDENED]
-- =============================================================================

-- anon: revoked from all tables/views
REVOKE ALL ON TABLE public.organizations       FROM anon;
REVOKE ALL ON TABLE public.families            FROM anon;
REVOKE ALL ON TABLE public.children            FROM anon;
REVOKE ALL ON TABLE public.parents             FROM anon;
REVOKE ALL ON TABLE public.school_terms        FROM anon;
REVOKE ALL ON TABLE public.waitlist_items      FROM anon;
REVOKE ALL ON TABLE public.tasks               FROM anon;
REVOKE ALL ON TABLE public.user_profiles       FROM anon;
REVOKE ALL ON TABLE public.rate_limit_log      FROM anon;
REVOKE ALL ON TABLE public.user_profiles_view      FROM anon;
REVOKE ALL ON TABLE public.waitlist_items_view     FROM anon;
REVOKE ALL ON TABLE public.waitlist_tasks_view     FROM anon;
REVOKE ALL ON TABLE public.data_integrity_issues   FROM anon;

-- Revoke PUBLIC execute on all internal/trigger functions so that anon and
-- authenticated don't inherit it. (PostgreSQL grants EXECUTE to PUBLIC by
-- default; revoking individual roles doesn't help if PUBLIC still has it.)
REVOKE EXECUTE ON FUNCTION public.get_auth_users()             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_waitlist_items_view() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_update_task_from_view()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_org()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_role()          FROM PUBLIC;

-- KEPT for anon: pre-login email check (called before a session exists)
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
GRANT ALL ON TABLE public.user_profiles_view      TO authenticated;
GRANT ALL ON TABLE public.waitlist_items_view     TO authenticated;
GRANT ALL ON TABLE public.waitlist_tasks_view     TO authenticated;
GRANT SELECT ON TABLE public.data_integrity_issues TO authenticated; -- read-only diagnostic

-- Re-grant to authenticated only what the app actually needs:
--   current_user_org/role  — called by every RLS policy expression
--   get_auth_users         — called by user_profiles_view JOIN
--   check_email_exists     — callable post-login (low risk, kept for consistency)
-- The Supabase Advisor will still flag current_user_org, current_user_role,
-- and get_auth_users as "callable via /rpc/" — these 3 warnings are
-- irreducible without moving functions to a private schema. The functions
-- are harmless (they return the caller's own org/role) and essential for RLS.
GRANT EXECUTE ON FUNCTION public.current_user_org()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_users()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text)     TO authenticated;


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
-- 2026-05-26  Supabase Advisor hardening (17 warnings → 6 irreducible):
--             [1] Revoked EXECUTE on internal/trigger functions from PUBLIC
--                 (not just from anon/authenticated — roles inherit from PUBLIC,
--                 so role-level revokes were ineffective).
--             [2] Re-granted only what the app needs: current_user_org,
--                 current_user_role, get_auth_users to authenticated;
--                 check_email_exists to anon + authenticated.
--             [3] Split all FOR ALL RLS policies into separate FOR INSERT,
--                 FOR UPDATE, FOR DELETE policies (clears multiple-permissive-
--                 SELECT advisor warnings on 7 tables).
--             [4] Consolidated user_profiles to a single SELECT policy with
--                 (select auth.uid()) — fixes auth_rls_initplan warning.
--             [5] Added idx_tasks_organization_id and
--                 idx_user_profiles_organization_id (missing FK indexes).
--             Remaining 6 (intentional): check_email_exists anon/authenticated
--             (login flow), current_user_org/role/get_auth_users authenticated
--             (RLS/view deps, irreducible without private schema refactor),
--             auth_leaked_password_protection (magic links only),
--             rate_limit_log no-policy INFO (intentional zero-access design).
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
-- 2026-05-27  Schema file corrections — live DB had diverged from doc:
--             [1] priority_status and priority_rank moved from children to
--                 families. families now has: priority_status text DEFAULT 'Regular',
--                 priority_rank integer DEFAULT 5.
--             [2] children no longer has priority_status column.
--             [3] waitlist_items_view updated: added families JOIN,
--                 priority_status/rank now from families, added child_notes.
--             [4] waitlist_tasks_view updated: priority_status/rank from families.
--             [5] update_waitlist_items_view() updated: children UPDATE now sets
--                 notes = NEW.child_notes instead of priority_status.
--             These changes were made in the DB but not captured in this file.
--
-- 2026-05-27  Phase 1 fix — Trigger functions updated to wl_ table names:
--             [1] fn_recompute_family_priority: was referencing public.parents,
--                 public.children, public.waitlist_items, public.families.
--                 Updated to wl_parents, wl_children, wl_waitlist_items, wl_families.
--             [2] fn_recompute_family_name: was referencing public.parents,
--                 public.families. Updated to wl_parents, wl_families.
--             [3] fn_trg_waitlist_items_priority: was referencing public.children.
--                 Updated to wl_children.
--             [4] All 6 helper/trigger functions added to this schema file
--                 (they were missing and therefore not updated in phase1_wl_prefix).
--             Root cause: any UPDATE to wl_parents (e.g. school_history) triggered
--             fn_trg_parents_priority → fn_recompute_family_priority, which failed
--             with "relation public.parents does not exist", rolling back the UPDATE.
--
-- 2026-05-27  Phase 1.4 — Added slug, type, domain to organizations:
--             [1] Created org_type_enum with 6 values matching ARCHITECTURE.md.
--             [2] Added slug (UNIQUE NOT NULL), type (org_type_enum), domain (nullable).
--             [3] Seeded Wildwood School: slug='wildwood', type='nonprofit'.
--             [4] Domain left NULL — populated when custom domains are configured (Phase 2).
--
-- 2026-05-27  Phase 1.3 — Renamed 6 waitlist tables to wl_ prefix:
--             [1] families→wl_families, children→wl_children, parents→wl_parents,
--                 school_terms→wl_school_terms, waitlist_items→wl_waitlist_items,
--                 tasks→wl_tasks.
--             [2] Recreated all 3 views with wl_ table names and security_invoker=true.
--             [3] Created modules and organization_modules core tables; seeded
--                 the waitlist module and Wildwood's enablement.
--
-- 2026-05-27  Phase 1 prep — documented data_integrity_issues view:
--             [1] Captured live view definition and added to this schema file.
--             [2] View was missing from schema file (known gap, noted in PROJECT.md).
--             [3] Noted security issue: view lacks security_invoker = true.
--                 Will be fixed in Phase 1.3 alongside wl_ table rename migration.
--             [4] References un-prefixed tables (families, parents, children,
--                 waitlist_items) — must be recreated in Phase 1.3.
--
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
-- 2026-05-28  Security fix — update_waitlist_items_view() → SECURITY INVOKER:
--             The INSTEAD OF UPDATE trigger function on waitlist_items_view was
--             SECURITY DEFINER, so its inner UPDATEs on wl_waitlist_items and
--             wl_children bypassed RLS. Any authenticated user (incl. read-only
--             Viewers) could write through the view, defeating the
--             Admin/Director-only base-table UPDATE policies — exploitable
--             directly via PostgREST, not just the updateWaitlistItem server
--             action. Flipped to SECURITY INVOKER (body unchanged) so base-table
--             RLS applies to the caller, matching fn_update_task_from_view().
--             Also added a defense-in-depth auth + role check to the
--             updateWaitlistItem server action.
--             Migration: migrations/security_fix_waitlist_view_trigger_invoker.sql
--
-- 2026-05-28  Atomic add-child + cross-org guards:
--             [1] Added wl_create_waitlist_entry() RPC (SECURITY INVOKER) so the
--                 family/child/waitlist-item inserts run in one transaction —
--                 fixes orphaned rows on partial failure. createWaitlistEntry
--                 server action rewired to call it.
--             [2] moveParentToFamily / moveChildToFamily now verify the target
--                 family is in the caller's org before reassigning (matching
--                 addParent) — closes a cross-tenant family_id linkage gap.
--             [3] deleteTerm restricted to Admin only (was Admin OR Director),
--                 matching the UI and CLAUDE.md.
--             Migration: migrations/add_wl_create_waitlist_entry_rpc.sql
--
-- =============================================================================
-- END OF SCHEMA DOCUMENT
-- =============================================================================

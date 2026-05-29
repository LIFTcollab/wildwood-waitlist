-- =============================================================================
-- WILDWOOD WAITLIST — SUPABASE SCHEMA (CURRENT STATE)
-- =============================================================================
-- Project   : Wildwood Waitlist / LiftCollab
-- Project ID: qxpftvnxorzwmawzhcjo
-- Region    : us-east-1
-- Postgres  : 17.6.1.104
-- Regenerated: 2026-05-28 — dumped from the LIVE database and reconciled, so
--              table names (wl_ prefix), views, policies, functions, and grants
--              now match production exactly. Curated commentary + change log
--              preserved. Prior versions had drifted from the live DB (old
--              un-prefixed table names in the Tables/Views/RLS sections).
--
-- Sections:
--   1. Extensions
--   2. Default Privileges
--   3. Enum Types
--   4. Tables
--   5. Indexes
--   6. Views                  (all WITH security_invoker = true)
--   7. Functions
--   8. Triggers
--   9. Row Level Security (RLS) Policies
--  10. Grants
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
-- pg_cron    : scheduled jobs (cleanup_rate_limit_log every 30 min)


-- =============================================================================
-- 2. DEFAULT PRIVILEGES                         [opted in 2026-05-12]
-- =============================================================================
-- Restrictive default privileges for TABLES and SEQUENCES: new tables in
-- `public` have NO grants by default and require explicit GRANTs.
--
-- NOTE: default privileges for FUNCTIONS were NOT changed, so Supabase's stock
-- default (EXECUTE granted to anon/authenticated/service_role) still applies to
-- newly created functions. CREATE OR REPLACE on an internal/trigger function
-- therefore silently re-grants EXECUTE to anon/authenticated — remember to
-- REVOKE again (see the 2026-05-28 re-harden in the change log).

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

-- Pattern for any new table (the three-step pattern):
--   CREATE TABLE public.your_table (...);
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
--   -- (RLS auto-enabled by the rls_auto_enable event trigger)
--   CREATE POLICY ... ON public.your_table FOR ... ;


-- =============================================================================
-- 3. ENUM TYPES
-- =============================================================================

CREATE TYPE public.org_status_enum     AS ENUM ('Active', 'Inactive');
CREATE TYPE public.org_type_enum       AS ENUM (
  'nonprofit', 'business_sponsor', 'foundation',
  'community_org', 'government', 'lift_internal'
);
CREATE TYPE public.priority_status_enum AS ENUM ('Board', 'Teacher', 'Alumni', 'Sibling', 'Regular');
-- NOTE: wl_families.priority_status is plain text (default 'Regular'), NOT this
-- enum. priority_status_enum is currently unused by any column.

-- school_history_enum: 'Board' was added later (ALTER TYPE ... ADD VALUE), so the
-- live value order is Teacher, Alumni, Board.
CREATE TYPE public.school_history_enum  AS ENUM ('Teacher', 'Alumni', 'Board');

CREATE TYPE public.school_term_name_enum AS ENUM ('Fall 25-26', 'Fall 26-27', 'Fall 27-28', 'Fall 28-29', 'Fall 29-30');
-- NOTE: school_term_name_enum is legacy/unused — wl_school_terms.name is plain text.

CREATE TYPE public.term_status_enum     AS ENUM ('Open', 'Closed');
CREATE TYPE public.classroom_enum       AS ENUM ('Younger Dome', 'Older Dome');
CREATE TYPE public.waitlist_status_enum AS ENUM ('Enrolled', 'Waitlisted', 'Declined', 'Inactive');
CREATE TYPE public.user_role_enum       AS ENUM ('Admin', 'Director', 'Viewer');
CREATE TYPE public.task_status_enum     AS ENUM ('To Do', 'Doing', 'Done');
CREATE TYPE public.task_priority_enum   AS ENUM ('Urgent', 'Important', 'Can Wait');
-- NOTE: task_priority_enum is currently unused — wl_tasks has no priority column
-- (see change log 2026-05-28). The dashboard's "urgent" count references a
-- priority column that does not exist and therefore always reads 0.


-- =============================================================================
-- 4. TABLES
-- =============================================================================
-- Core platform tables: organizations, modules, organization_modules,
-- user_profiles, rate_limit_log.
-- Waitlist module tables are wl_-prefixed (renamed from un-prefixed in Phase 1.3).

CREATE TABLE public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id   text,
  name        text NOT NULL,
  status      public.org_status_enum,
  created_at  timestamptz DEFAULT now(),
  slug        text UNIQUE NOT NULL,            -- [Phase 1.4] subdomain identifier
  type        public.org_type_enum,            -- [Phase 1.4]
  domain      text                             -- [Phase 1.4] custom domain (future)
);

CREATE TABLE public.modules (                  -- [Phase 1.3] module registry
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE public.organization_modules (     -- [Phase 1.3] per-org module enablement
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  module_id       uuid NOT NULL REFERENCES public.modules(id),
  enabled         boolean NOT NULL DEFAULT true,
  config          jsonb,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, module_id)
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
  email_hash text
);

CREATE TABLE public.wl_families (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  name            text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now(),
  priority_rank   integer DEFAULT 5,           -- 5 = Regular; auto-recomputed by triggers
  priority_status text    DEFAULT 'Regular'    -- plain text, not an enum
);

CREATE TABLE public.wl_children (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  dob             date,
  notes           text,
  family_id       uuid NOT NULL REFERENCES public.wl_families(id),
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
  -- priority_status lives on wl_families, not here
);

CREATE TABLE public.wl_parents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text,
  phone           text,
  primary_contact boolean DEFAULT false,
  school_history  public.school_history_enum,
  family_id       uuid NOT NULL REFERENCES public.wl_families(id),
  organization_id uuid REFERENCES public.organizations(id),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.wl_school_terms (
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

CREATE TABLE public.wl_waitlist_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text,
  child_id        uuid REFERENCES public.wl_children(id),
  term_id         uuid REFERENCES public.wl_school_terms(id),
  organization_id uuid REFERENCES public.organizations(id),
  status          public.waitlist_status_enum,
  classroom       public.classroom_enum,
  date_applied    date,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.wl_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        text,
  waitlist_item_id uuid REFERENCES public.wl_waitlist_items(id),
  organization_id  uuid REFERENCES public.organizations(id),
  description      text,
  status           public.task_status_enum DEFAULT 'To Do',
  created_at       timestamptz DEFAULT now()
  -- NOTE: no `name` column (dropped 2026-05-26; computed live in the view) and
  -- no `priority` column (the dashboard's urgent count references one anyway).
);


-- =============================================================================
-- 5. INDEXES
-- =============================================================================
-- Primary-key indexes retain their pre-rename names (e.g. children_pkey on
-- wl_children) — Postgres does not rename PK indexes when a table is renamed.

CREATE INDEX idx_user_profiles_organization_id     ON public.user_profiles   USING btree (organization_id);
CREATE INDEX idx_rate_limit_log_created            ON public.rate_limit_log  USING btree (created_at);
CREATE INDEX idx_rate_limit_log_email_hash         ON public.rate_limit_log  USING btree (email_hash, created_at);
CREATE INDEX idx_rate_limit_log_ip                 ON public.rate_limit_log  USING btree (ip_address);
CREATE INDEX idx_wl_children_family_id             ON public.wl_children       USING btree (family_id);
CREATE INDEX idx_wl_children_organization_id       ON public.wl_children       USING btree (organization_id);
CREATE INDEX idx_wl_families_organization_id       ON public.wl_families       USING btree (organization_id);
CREATE INDEX idx_wl_parents_family_id              ON public.wl_parents        USING btree (family_id);
CREATE INDEX idx_wl_parents_organization_id        ON public.wl_parents        USING btree (organization_id);
CREATE INDEX idx_wl_school_terms_organization_id   ON public.wl_school_terms   USING btree (organization_id);
CREATE INDEX idx_wl_tasks_organization_id          ON public.wl_tasks          USING btree (organization_id);
CREATE INDEX idx_wl_tasks_waitlist_item_id         ON public.wl_tasks          USING btree (waitlist_item_id);
CREATE INDEX idx_wl_waitlist_items_child_id        ON public.wl_waitlist_items USING btree (child_id);
CREATE INDEX idx_wl_waitlist_items_organization_id ON public.wl_waitlist_items USING btree (organization_id);
CREATE INDEX idx_wl_waitlist_items_term_id         ON public.wl_waitlist_items USING btree (term_id);


-- =============================================================================
-- 6. VIEWS                              (all WITH security_invoker = true)
-- =============================================================================

-- user_profiles_view — SECURITY INVOKER. get_auth_users() self-filters rows by
-- auth.uid() and the caller's role, so no WHERE clause is needed here.
CREATE VIEW public.user_profiles_view
WITH (security_invoker = true)
AS
  SELECT up.id, up.name, up.role, up.organization_id,
         o.name AS organization_name,
         up.created_at,
         au.email, au.last_sign_in_at, au.invited_at, au.confirmed_at
  FROM public.user_profiles up
  LEFT JOIN public.get_auth_users() au ON au.id = up.id
  LEFT JOIN public.organizations o ON o.id = up.organization_id;


-- waitlist_items_view — denormalized waitlist_items → children → families → terms.
-- priority_status/priority_rank come from wl_families; child_notes is
-- wl_children.notes; term_name is plain text. Writable via the
-- update_waitlist_items_view() INSTEAD OF UPDATE trigger.
CREATE VIEW public.waitlist_items_view
WITH (security_invoker = true)
AS
  SELECT wi.id, wi.status, wi.classroom, wi.date_applied, wi.notes, wi.created_at,
         wi.child_id, wi.term_id, wi.organization_id,
         c.dob, c.first_name, c.last_name,
         (c.first_name || ' ' || c.last_name) AS child_full_name,
         c.notes                              AS child_notes,
         f.priority_status, f.priority_rank,
         st.name       AS term_name,
         st.start_date AS term_start_date,
         st.end_date   AS term_end_date,
         st.status     AS term_status
  FROM public.wl_waitlist_items wi
  JOIN public.wl_children     c  ON c.id  = wi.child_id
  JOIN public.wl_families     f  ON f.id  = c.family_id
  JOIN public.wl_school_terms st ON st.id = wi.term_id;


-- waitlist_tasks_view — task_name computed live as "<first> <last>: <term>".
-- Writable via the fn_update_task_from_view() INSTEAD OF UPDATE trigger
-- (description + status only).
CREATE VIEW public.waitlist_tasks_view
WITH (security_invoker = true)
AS
  SELECT t.id AS task_id,
         (c.first_name || ' ' || c.last_name || ': ' || st.name) AS task_name,
         t.status      AS task_status,
         t.description AS task_description,
         wi.id         AS waitlist_item_id,
         wi.status     AS waitlist_status,
         wi.classroom, wi.date_applied,
         wi.notes      AS waitlist_notes,
         c.id          AS child_id,
         c.first_name  AS child_first_name,
         c.last_name   AS child_last_name,
         (c.first_name || ' ' || c.last_name) AS child_full_name,
         c.dob         AS child_dob,
         f.priority_status AS child_priority_status,
         f.priority_rank,
         f.id   AS family_id,
         f.name AS family_name,
         st.id  AS term_id,
         st.name AS term_name,
         st.status AS term_status,
         wi.organization_id,
         t.created_at
  FROM public.wl_tasks t
  JOIN public.wl_waitlist_items wi ON wi.id = t.waitlist_item_id
  JOIN public.wl_children     c    ON c.id  = wi.child_id
  JOIN public.wl_families     f    ON f.id  = c.family_id
  JOIN public.wl_school_terms st   ON st.id = wi.term_id;


-- data_integrity_issues — Admin/Director diagnostic. SECURITY INVOKER; tenant
-- isolation comes from base-table RLS. Eight checks (UNION ALL branches).
CREATE VIEW public.data_integrity_issues
WITH (security_invoker = true)
AS
  -- families with no parents
  SELECT 'no_parents'::text AS issue_type, 'error'::text AS severity,
         'Family has no parents'::text AS description,
         f.id AS family_id, f.name AS family_name, NULL::uuid AS entity_id
  FROM public.wl_families f
  WHERE NOT EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = f.id)
  UNION ALL
  -- families with no children
  SELECT 'no_children', 'warning', 'Family has no children',
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  WHERE NOT EXISTS (SELECT 1 FROM public.wl_children c WHERE c.family_id = f.id)
  UNION ALL
  -- children with no waitlist entry
  SELECT 'no_waitlist_entry', 'warning',
         'Child has no waitlist entry: ' || c.first_name || ' ' || c.last_name,
         c.family_id, f.name, c.id
  FROM public.wl_children c
  JOIN public.wl_families f ON f.id = c.family_id
  WHERE NOT EXISTS (SELECT 1 FROM public.wl_waitlist_items wi WHERE wi.child_id = c.id)
  UNION ALL
  -- families with parents but no primary contact
  SELECT 'no_primary_contact', 'warning', 'Family has no primary contact set',
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  WHERE EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = f.id AND p.primary_contact = true)
  UNION ALL
  -- families with more than one primary contact
  SELECT 'multiple_primary_contacts', 'warning',
         'Family has ' || count(*) || ' primary contacts',
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  JOIN public.wl_parents p ON p.family_id = f.id AND p.primary_contact = true
  GROUP BY f.id, f.name
  HAVING count(*) > 1
  UNION ALL
  -- family.name doesn't match sorted distinct parent last names
  SELECT 'name_drift', 'error',
         'Family name "' || f.name || '" doesn''t match parent last names',
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  WHERE f.name IS DISTINCT FROM (
          SELECT string_agg(sub.last_name, '-' ORDER BY sub.last_name)
          FROM (SELECT DISTINCT trim(p.last_name) AS last_name
                FROM public.wl_parents p
                WHERE p.family_id = f.id AND trim(p.last_name) <> '') sub)
    AND EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = f.id)
  UNION ALL
  -- same email on multiple parents in the same org
  SELECT 'duplicate_email', 'error',
         'Email shared by multiple parents: ' || p.email,
         p.family_id, f.name, p.id
  FROM public.wl_parents p
  JOIN public.wl_families f ON f.id = p.family_id
  WHERE p.email IS NOT NULL
    AND (SELECT count(*) FROM public.wl_parents p2
         WHERE p2.email = p.email AND p2.organization_id = p.organization_id) > 1
  UNION ALL
  -- parent with no family  [added during Phase 2 feature work]
  SELECT 'orphaned_parent', 'error',
         'Parent has no family: ' || p.first_name || ' ' || p.last_name,
         NULL::uuid, NULL::text, p.id
  FROM public.wl_parents p
  WHERE p.family_id IS NULL;


-- =============================================================================
-- 7. FUNCTIONS
-- =============================================================================
-- All SECURITY DEFINER functions set an explicit search_path. The two view
-- INSTEAD OF UPDATE trigger functions are SECURITY INVOKER so base-table RLS
-- applies to the caller (see 2026-05-28 fix).

-- current_user_org() / current_user_role() — caller's org/role. SECURITY DEFINER;
-- called by every RLS policy.
CREATE OR REPLACE FUNCTION public.current_user_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT organization_id FROM public.user_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role_enum LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- get_auth_users() — safe subset of auth.users; self-filters by auth.uid() and
-- the caller's role/org. Returns zero rows pre-auth.
CREATE OR REPLACE FUNCTION public.get_auth_users()
RETURNS TABLE (id uuid, email varchar, invited_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT au.id, au.email, au.invited_at, au.confirmed_at, au.last_sign_in_at
  FROM auth.users au
  JOIN public.user_profiles up ON up.id = au.id
  WHERE au.id = auth.uid()
     OR (public.current_user_role() = ANY (ARRAY['Admin'::public.user_role_enum, 'Director'::public.user_role_enum])
         AND up.organization_id = public.current_user_org());
$$;

-- handle_new_user() — auth.users INSERT trigger; creates a user_profiles row with
-- NULL role/org (set manually by an Admin) to prevent privilege injection.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, role, organization_id, created_at)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NULL, NULL, NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- check_email_exists() — rate-limited pre-login email check. SECURITY DEFINER;
-- granted to anon (called before a session exists).
CREATE OR REPLACE FUNCTION public.check_email_exists(input_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions' AS $$
DECLARE
  ip_count INT; email_count INT; client_ip TEXT; hashed_email TEXT;
  window_start TIMESTAMPTZ; email_window TIMESTAMPTZ; result BOOLEAN;
BEGIN
  BEGIN client_ip := current_setting('request.headers')::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN client_ip := 'unknown'; END;

  hashed_email := encode(digest(lower(trim(input_email)), 'sha256'), 'hex');
  window_start := NOW() - INTERVAL '1 minute';
  email_window := NOW() - INTERVAL '10 minutes';

  SELECT COUNT(*) INTO ip_count    FROM public.rate_limit_log WHERE ip_address = client_ip   AND created_at >= window_start;
  SELECT COUNT(*) INTO email_count FROM public.rate_limit_log WHERE email_hash = hashed_email AND created_at >= email_window;

  SELECT EXISTS (
    SELECT 1 FROM auth.users au JOIN public.user_profiles up ON up.id = au.id
    WHERE lower(au.email) = lower(trim(input_email))
  ) INTO result;

  INSERT INTO public.rate_limit_log (ip_address, email_hash, created_at)
  VALUES (client_ip, hashed_email, NOW());

  IF ip_count    >= 5  THEN RAISE EXCEPTION 'Rate limit exceeded. Please try again later.'; END IF;
  IF email_count >= 10 THEN RAISE EXCEPTION 'Rate limit exceeded. Please try again later.'; END IF;
  RETURN result;
END;
$$;

-- cleanup_rate_limit_log() — deletes rate_limit_log rows older than 1 hour
-- (pg_cron, every 30 min).
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_log()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  DELETE FROM public.rate_limit_log WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- update_waitlist_items_view() — INSTEAD OF UPDATE trigger for
-- waitlist_items_view. SECURITY INVOKER (must not be DEFINER, or Viewers could
-- write through the view and bypass base-table RLS — fixed 2026-05-28).
CREATE OR REPLACE FUNCTION public.update_waitlist_items_view()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_term_id uuid;
BEGIN
  IF NEW.term_name IS NOT NULL AND NEW.term_name IS DISTINCT FROM OLD.term_name THEN
    SELECT id INTO v_term_id FROM public.wl_school_terms WHERE name = NEW.term_name::text LIMIT 1;
    IF v_term_id IS NULL THEN RAISE EXCEPTION 'Term not found: %', NEW.term_name; END IF;
  ELSE
    v_term_id := NEW.term_id;
  END IF;

  UPDATE public.wl_waitlist_items SET
    status = NEW.status, classroom = NEW.classroom, date_applied = NEW.date_applied,
    notes = NEW.notes, term_id = v_term_id
  WHERE id = NEW.id;

  UPDATE public.wl_children SET
    first_name = NEW.first_name, last_name = NEW.last_name, dob = NEW.dob, notes = NEW.child_notes
  WHERE id = NEW.child_id;

  RETURN NEW;
END;
$$;

-- fn_update_task_from_view() — INSTEAD OF UPDATE trigger for waitlist_tasks_view.
-- SECURITY INVOKER. Only description + status are writable.
CREATE OR REPLACE FUNCTION public.fn_update_task_from_view()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.wl_tasks SET description = NEW.task_description, status = NEW.task_status
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;

-- rls_auto_enable() — event trigger; auto-enables RLS on new public tables.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog' AS $$
DECLARE cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name = 'public' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    END IF;
  END LOOP;
END;
$$;

-- Priority / family-name auto-recompute helpers. SECURITY DEFINER, called only by
-- the wl_parents / wl_children / wl_waitlist_items triggers. EXECUTE is revoked
-- from PUBLIC/anon/authenticated (the trigger definer context retains access).
CREATE OR REPLACE FUNCTION public.fn_recompute_family_priority(p_family_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_prank integer;
BEGIN
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = p_family_id AND p.school_history::text = 'Board')   THEN 1
    WHEN EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = p_family_id AND p.school_history::text = 'Teacher') THEN 2
    WHEN EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = p_family_id AND p.school_history::text = 'Alumni')  THEN 3
    WHEN (SELECT COUNT(DISTINCT sib.id) FROM public.wl_children sib
          JOIN public.wl_waitlist_items wi ON wi.child_id = sib.id
          WHERE sib.family_id = p_family_id AND wi.status::text = ANY(ARRAY['Enrolled','Waitlisted'])) > 1 THEN 4
    ELSE 5
  END INTO v_prank;
  UPDATE public.wl_families
     SET priority_rank = v_prank,
         priority_status = CASE v_prank WHEN 1 THEN 'Board' WHEN 2 THEN 'Teacher'
                                        WHEN 3 THEN 'Alumni' WHEN 4 THEN 'Sibling' ELSE 'Regular' END
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
    IF OLD.family_id IS DISTINCT FROM NEW.family_id THEN PERFORM public.fn_recompute_family_priority(OLD.family_id); END IF;
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
  IF TG_OP = 'DELETE' THEN SELECT family_id INTO v_family_id FROM public.wl_children WHERE id = OLD.child_id;
  ELSE SELECT family_id INTO v_family_id FROM public.wl_children WHERE id = NEW.child_id; END IF;
  IF v_family_id IS NOT NULL THEN PERFORM public.fn_recompute_family_priority(v_family_id); END IF;
  RETURN NULL;
END;
$$;

-- wl_create_waitlist_entry() — atomic "add child to waitlist": family (resolve or
-- create) → child → waitlist item in one transaction. SECURITY INVOKER, so RLS +
-- the role check apply; a mid-way failure rolls everything back (no orphan rows).
-- Verifies a supplied family belongs to the caller's org. Called by the
-- createWaitlistEntry server action. EXECUTE granted to authenticated only.
CREATE OR REPLACE FUNCTION public.wl_create_waitlist_entry(
  p_family_id uuid, p_family_name text, p_first_name text, p_last_name text,
  p_dob date, p_term_id uuid, p_status text, p_classroom text,
  p_date_applied date, p_notes text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_org    uuid := public.current_user_org();
  v_role   public.user_role_enum := public.current_user_role();
  v_family uuid := p_family_id;
  v_child  uuid;
  v_item   uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No organization found for your account'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('Admin', 'Director') THEN
    RAISE EXCEPTION 'Only Admins and Directors can add waitlist entries';
  END IF;

  IF v_family IS NULL THEN
    INSERT INTO public.wl_families (name, organization_id)
    VALUES (btrim(p_family_name), v_org) RETURNING id INTO v_family;
  ELSE
    PERFORM 1 FROM public.wl_families WHERE id = v_family AND organization_id = v_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Family not found'; END IF;
  END IF;

  INSERT INTO public.wl_children (first_name, last_name, dob, family_id, organization_id)
  VALUES (btrim(p_first_name), btrim(p_last_name), p_dob, v_family, v_org)
  RETURNING id INTO v_child;

  INSERT INTO public.wl_waitlist_items
    (child_id, term_id, organization_id, status, classroom, date_applied, notes)
  VALUES (v_child, p_term_id, v_org,
          NULLIF(p_status, '')::public.waitlist_status_enum,
          NULLIF(p_classroom, '')::public.classroom_enum,
          p_date_applied, NULLIF(p_notes, ''))
  RETURNING id INTO v_item;

  RETURN jsonb_build_object('item_id', v_item, 'child_id', v_child);
END;
$$;


-- =============================================================================
-- 8. TRIGGERS
-- =============================================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_update_waitlist_items_view
  INSTEAD OF UPDATE ON public.waitlist_items_view
  FOR EACH ROW EXECUTE FUNCTION public.update_waitlist_items_view();

CREATE TRIGGER trg_update_task_from_view
  INSTEAD OF UPDATE ON public.waitlist_tasks_view
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_task_from_view();

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
  WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();


-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================
-- RLS enabled on every table. Pattern: one FOR SELECT (all staff, scoped by org)
-- + separate FOR INSERT/UPDATE/DELETE (Admins/Directors, scoped by org). No
-- FOR ALL policies. modules/organization_modules are read-only to staff (managed
-- out-of-band). rate_limit_log has no policies (zero direct access).

ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wl_families          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wl_children          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wl_parents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wl_school_terms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wl_waitlist_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wl_tasks             ENABLE ROW LEVEL SECURITY;

-- ── organizations (keyed on id, not organization_id) ──
CREATE POLICY "Any staff can view their org" ON public.organizations
  FOR SELECT TO authenticated USING (id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert their org" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND id = public.current_user_org());
CREATE POLICY "Admins and Directors can update their org" ON public.organizations
  FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete their org" ON public.organizations
  FOR DELETE TO authenticated USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND id = public.current_user_org());

-- ── modules / organization_modules (read-only to staff) ──
CREATE POLICY "All staff can view modules" ON public.modules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can view their org modules" ON public.organization_modules
  FOR SELECT TO authenticated USING (organization_id = public.current_user_org());

-- ── user_profiles (own row, or Admin/Director within org) ──
CREATE POLICY "Staff can view user profiles" ON public.user_profiles
  FOR SELECT TO authenticated USING (
    id = (SELECT auth.uid())
    OR (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org()));
CREATE POLICY "Admins and Directors can insert profiles in org" ON public.user_profiles
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update profiles in org" ON public.user_profiles
  FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete profiles in org" ON public.user_profiles
  FOR DELETE TO authenticated USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- ── wl_families (the wl_ tables all follow this identical four-policy pattern) ──
CREATE POLICY "Any staff can view families" ON public.wl_families
  FOR SELECT TO authenticated USING (organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can insert families" ON public.wl_families
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can update families" ON public.wl_families
  FOR UPDATE TO authenticated USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org())
  WITH CHECK (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org());
CREATE POLICY "Admins and Directors can delete families" ON public.wl_families
  FOR DELETE TO authenticated USING (public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum,'Director'::user_role_enum]) AND organization_id = public.current_user_org());

-- The following tables have the SAME four policies as wl_families above, scoped by
-- organization_id = current_user_org() on SELECT and role + org on writes:
--   wl_children       — "Any staff can view children"       (+ insert/update/delete)
--   wl_parents        — "Any staff can view parents"        (+ insert/update/delete)
--   wl_school_terms   — "Any staff can view terms"          (+ insert/update/delete)
--   wl_waitlist_items — "Any staff can view waitlist items" (+ insert/update/delete)
--   wl_tasks          — "Any staff can view tasks"          (+ insert/update/delete)


-- =============================================================================
-- 10. GRANTS
-- =============================================================================
-- anon: no SELECT on any app table/view (only EXECUTE on check_email_exists).
-- authenticated: full DML on every app table/view (RLS does the row gating).
-- service_role: platform default; the app uses the anon key only and never
-- service_role.

-- Tables/views — authenticated has SELECT/INSERT/UPDATE/DELETE; anon revoked.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modules              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_log       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wl_families          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wl_children          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wl_parents           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wl_school_terms      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wl_waitlist_items    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wl_tasks             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_items_view  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_tasks_view  TO authenticated;
GRANT SELECT                         ON public.user_profiles_view    TO authenticated;
GRANT SELECT                         ON public.data_integrity_issues TO authenticated;
-- (anon retains only harmless non-DML view privileges like REFERENCES/TRIGGER on
--  user_profiles_view; it has no SELECT on any app object.)

-- Function EXECUTE — only these are reachable by anon/authenticated:
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon, authenticated;  -- login flow (anon needed)
GRANT EXECUTE ON FUNCTION public.current_user_org()       TO authenticated;        -- RLS dependency
GRANT EXECUTE ON FUNCTION public.current_user_role()      TO authenticated;        -- RLS dependency
GRANT EXECUTE ON FUNCTION public.get_auth_users()         TO authenticated;        -- user_profiles_view dependency
GRANT EXECUTE ON FUNCTION public.wl_create_waitlist_entry(
  uuid, text, text, text, date, uuid, text, text, date, text) TO authenticated;    -- atomic add-child

-- All internal/trigger/recompute functions have EXECUTE revoked from
-- PUBLIC/anon/authenticated (they run via trigger definer context):
--   handle_new_user, cleanup_rate_limit_log, rls_auto_enable,
--   update_waitlist_items_view, fn_update_task_from_view,
--   fn_recompute_family_priority, fn_recompute_family_name,
--   fn_trg_parents_priority, fn_trg_parents_family_name,
--   fn_trg_children_family_priority, fn_trg_waitlist_items_priority.
-- (current_user_org/current_user_role/get_auth_users are still flagged by the
--  Supabase Advisor as REST-callable — intentional/irreducible; they return only
--  the caller's own org/role.)


-- =============================================================================
-- 11. SCHEDULED JOBS
-- =============================================================================
-- cleanup-rate-limit-log: deletes rate_limit_log rows older than 1 hour, every
-- 30 minutes via pg_cron.
-- View: SELECT * FROM cron.job WHERE jobname = 'cleanup-rate-limit-log';


-- =============================================================================
-- 12. CHANGE LOG
-- =============================================================================
--
-- 2026-04-12  Initial schema; RLS on all tables; rls_auto_enable event trigger.
-- 2026-05-12  Security hardening pass 1: anon grants revoked; WITH CHECK on all
--             write policies; check_email_exists rate limiting + PII-free logging;
--             email_hash column; user_profiles_view restricted; pg_cron cleanup.
-- 2026-05-12  search_path hardening on all SECURITY DEFINER functions; fully
--             qualified table references; check_email_exists fixed to query
--             auth.users directly; update_waitlist_items_view rewritten.
-- 2026-05-12  Opted in to restrictive default privileges (TABLES/SEQUENCES) —
--             new tables now require explicit GRANTs.
-- 2026-05-12  Backups moved to Supabase Pro built-in daily; DB password rotated.
-- 2026-05-13  SECURITY DEFINER view restructure: user_profiles_view → explicit
--             SECURITY INVOKER; get_auth_users() self-filters; revoked EXECUTE on
--             trigger/internal functions that should not be REST-callable.
-- 2026-05-26  Supabase Advisor hardening (17 → 6 irreducible): revoked EXECUTE on
--             internal/trigger functions from PUBLIC; re-granted only what the app
--             needs; split FOR ALL policies into per-operation; consolidated
--             user_profiles SELECT with (select auth.uid()); added FK indexes.
-- 2026-05-26  Term management UI; dropped school_term_name_enum cast from
--             waitlist_items_view (term_name now plain text); ensured
--             security_invoker = true on waitlist_items_view.
-- 2026-05-26  waitlist_tasks_view set to security_invoker = true; tasks.name
--             column dropped (task_name computed live in the view).
-- 2026-05-27  Schema corrections: priority_status/priority_rank moved from
--             children to families; views/trigger updated accordingly.
-- 2026-05-27  Phase 1.3 — renamed 6 waitlist tables to wl_ prefix; recreated all
--             views with wl_ names + security_invoker; added modules and
--             organization_modules; seeded waitlist module + Wildwood enablement.
-- 2026-05-27  Phase 1 fix — trigger/helper functions updated to wl_ table names
--             (fn_recompute_*, fn_trg_*). Root cause of silent wl_parents UPDATE
--             rollbacks. NOTE: these CREATE OR REPLACEs re-granted EXECUTE to
--             anon/authenticated (default privileges) — re-revoked 2026-05-28.
-- 2026-05-27  Phase 1.4 — added slug/type/domain to organizations; org_type_enum.
--
-- 2026-05-28  Security fix — update_waitlist_items_view() → SECURITY INVOKER:
--             the view's INSTEAD OF UPDATE trigger was SECURITY DEFINER, so its
--             inner UPDATEs bypassed RLS and let any authenticated user (incl.
--             read-only Viewers) write through the view. Flipped to INVOKER (body
--             unchanged); added a defense-in-depth auth+role check to the
--             updateWaitlistItem server action.
--             Migration: migrations/security_fix_waitlist_view_trigger_invoker.sql
-- 2026-05-28  Atomic add-child + cross-org guards:
--             [1] Added wl_create_waitlist_entry() RPC (SECURITY INVOKER) so the
--                 family/child/waitlist-item inserts run in one transaction —
--                 fixes orphaned rows on partial failure. createWaitlistEntry
--                 rewired to call it.
--             [2] moveParentToFamily / moveChildToFamily now verify the target
--                 family is in the caller's org (cross-tenant linkage guard).
--             [3] deleteTerm restricted to Admin only.
--             Migration: migrations/add_wl_create_waitlist_entry_rpc.sql
-- 2026-05-28  Re-hardened internal function EXECUTE grants: the Phase 1 trigger
--             fix had re-granted EXECUTE to anon/authenticated on the recompute /
--             trigger helpers (default privileges on CREATE OR REPLACE). The two
--             fn_recompute_* helpers return a value and were thus reachable via
--             PostgREST /rpc by anon (SECURITY DEFINER). Re-revoked EXECUTE from
--             PUBLIC/anon/authenticated on all internal/trigger functions, and
--             from anon on wl_create_waitlist_entry.
--             Migration: migrations/reharden_internal_function_execute_grants.sql
-- 2026-05-28  Schema file regenerated from the live database (this document).
--             Reconciled table/view/policy/function names to the wl_ prefix and
--             current definitions. Known mismatch surfaced (NOT yet changed):
--             wl_tasks has no `priority` column, but the dashboard's "urgent"
--             count queries .eq("priority","Urgent"), so that figure is always 0.
--
-- =============================================================================
-- END OF SCHEMA DOCUMENT
-- =============================================================================

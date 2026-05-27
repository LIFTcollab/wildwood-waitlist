-- =============================================================================
-- PHASE 1.3 MIGRATION — wl_ table prefix + module registry
-- =============================================================================
-- Project   : Wildwood Waitlist / LiftCollab Platform
-- Phase     : 1.3 (per ROADMAP.md)
-- Written   : 2026-05-27
--
-- PURPOSE
-- Renames the six waitlist tables to the wl_ prefix convention, recreates
-- all views and triggers to reference the new names, and creates the
-- modules + organization_modules core tables.
--
-- APPLY ORDER
-- This migration must be applied AFTER Step 4 app code is ready (all server
-- actions updated to use wl_ table names). Deploy the app code and apply
-- this migration in the same window to minimize downtime.
--
-- WHAT CHANGES
--   Tables renamed:   families         → wl_families
--                     children         → wl_children
--                     parents          → wl_parents
--                     school_terms     → wl_school_terms
--                     waitlist_items   → wl_waitlist_items
--                     tasks            → wl_tasks
--   Indexes renamed:  matching wl_ prefix (cosmetic only)
--   Functions updated: update_waitlist_items_view, fn_update_task_from_view
--   Views recreated:  waitlist_items_view, waitlist_tasks_view,
--                     data_integrity_issues (gains security_invoker = true)
--   Grants restored:  views lose grants on DROP; re-applied after CREATE
--   New tables:       modules, organization_modules
--   Seed data:        waitlist module row, Wildwood org-module row
--
-- WHAT DOES NOT CHANGE
--   Grants on renamed tables     — follow the table OID, survive rename
--   RLS policies on renamed tables — follow the table OID, survive rename
--   FK constraints               — follow OID, survive rename
--   organizations, user_profiles, rate_limit_log  — not renamed
--   user_profiles_view           — references only un-renamed tables; unchanged
--   current_user_org(), current_user_role()       — reference user_profiles; unchanged
--   check_email_exists(), handle_new_user()       — reference user_profiles; unchanged
--   get_auth_users()                              — references user_profiles; unchanged
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A. RENAME TABLES
-- Grants, RLS policies, and FK constraints follow by OID — no changes needed.
-- ---------------------------------------------------------------------------

ALTER TABLE public.families       RENAME TO wl_families;
ALTER TABLE public.children       RENAME TO wl_children;
ALTER TABLE public.parents        RENAME TO wl_parents;
ALTER TABLE public.school_terms   RENAME TO wl_school_terms;
ALTER TABLE public.waitlist_items RENAME TO wl_waitlist_items;
ALTER TABLE public.tasks          RENAME TO wl_tasks;


-- ---------------------------------------------------------------------------
-- B. RENAME INDEXES
-- Cosmetic only — index names don't affect query execution.
-- IF EXISTS guards against index not existing (e.g. if added between schema
-- doc and migration write).
-- ---------------------------------------------------------------------------

ALTER INDEX IF EXISTS idx_children_family_id
  RENAME TO idx_wl_children_family_id;
ALTER INDEX IF EXISTS idx_children_organization_id
  RENAME TO idx_wl_children_organization_id;
ALTER INDEX IF EXISTS idx_families_organization_id
  RENAME TO idx_wl_families_organization_id;
ALTER INDEX IF EXISTS idx_parents_family_id
  RENAME TO idx_wl_parents_family_id;
ALTER INDEX IF EXISTS idx_parents_organization_id
  RENAME TO idx_wl_parents_organization_id;
ALTER INDEX IF EXISTS idx_school_terms_organization_id
  RENAME TO idx_wl_school_terms_organization_id;
ALTER INDEX IF EXISTS idx_waitlist_items_child_id
  RENAME TO idx_wl_waitlist_items_child_id;
ALTER INDEX IF EXISTS idx_waitlist_items_term_id
  RENAME TO idx_wl_waitlist_items_term_id;
ALTER INDEX IF EXISTS idx_waitlist_items_organization_id
  RENAME TO idx_wl_waitlist_items_organization_id;
ALTER INDEX IF EXISTS idx_waitlist_item_tasks_waitlist_item_id
  RENAME TO idx_wl_tasks_waitlist_item_id;
ALTER INDEX IF EXISTS idx_tasks_organization_id
  RENAME TO idx_wl_tasks_organization_id;


-- ---------------------------------------------------------------------------
-- C. UPDATE TRIGGER FUNCTIONS
-- Must happen before dropping views. CREATE OR REPLACE is safe — no
-- dependencies prevent updating a function that a trigger references.
-- ---------------------------------------------------------------------------

-- update_waitlist_items_view
-- References school_terms, waitlist_items, children → all renamed to wl_ prefix.
-- Logic unchanged: writes waitlist_items fields + child name/dob/notes.
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
    FROM public.wl_school_terms
    WHERE name = NEW.term_name::text
    LIMIT 1;

    IF v_term_id IS NULL THEN
      RAISE EXCEPTION 'Term not found: %', NEW.term_name;
    END IF;
  ELSE
    v_term_id := NEW.term_id;
  END IF;

  UPDATE public.wl_waitlist_items SET
    status       = NEW.status,
    classroom    = NEW.classroom,
    date_applied = NEW.date_applied,
    notes        = NEW.notes,
    term_id      = v_term_id
  WHERE id = NEW.id;

  UPDATE public.wl_children SET
    first_name = NEW.first_name,
    last_name  = NEW.last_name,
    dob        = NEW.dob,
    notes      = NEW.child_notes
  WHERE id = NEW.child_id;

  RETURN NEW;
END;
$$;


-- fn_update_task_from_view
-- References tasks → wl_tasks. Logic unchanged.
CREATE OR REPLACE FUNCTION public.fn_update_task_from_view()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.wl_tasks
  SET
    description = NEW.task_description,
    status      = NEW.task_status
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- D. DROP VIEWS
-- CASCADE automatically drops the INSTEAD OF triggers attached to each view.
-- Grants on these views are also removed and must be re-applied in step G.
-- user_profiles_view is NOT dropped — it references only un-renamed tables.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.waitlist_items_view CASCADE;
DROP VIEW IF EXISTS public.waitlist_tasks_view CASCADE;
DROP VIEW IF EXISTS public.data_integrity_issues CASCADE;


-- ---------------------------------------------------------------------------
-- E. RECREATE VIEWS WITH wl_ TABLE NAMES
-- ---------------------------------------------------------------------------

-- waitlist_items_view
-- waitlist_items → children → families → school_terms
-- priority_status and priority_rank come from wl_families.
-- child_notes is wl_children.notes under an alias (for the inline editor).
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
  FROM public.wl_waitlist_items wi
  JOIN public.wl_children c      ON c.id  = wi.child_id
  JOIN public.wl_families f      ON f.id  = c.family_id
  JOIN public.wl_school_terms st ON st.id = wi.term_id;


-- waitlist_tasks_view
-- task_name computed live: "First Last: Term" — never stored.
-- priority_status and priority_rank from wl_families.
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
  FROM public.wl_tasks t
  JOIN public.wl_waitlist_items wi ON wi.id = t.waitlist_item_id
  JOIN public.wl_children c        ON c.id  = wi.child_id
  JOIN public.wl_families f        ON f.id  = c.family_id
  JOIN public.wl_school_terms st   ON st.id = wi.term_id;


-- data_integrity_issues
-- Now WITH (security_invoker = true) — fixes the convention deviation noted
-- in Phase 1 prep (2026-05-27 schema doc entry).
CREATE VIEW public.data_integrity_issues
WITH (security_invoker = true)
AS
  -- families with no parents at all
  SELECT 'no_parents'::text            AS issue_type,
         'error'::text                 AS severity,
         'Family has no parents'::text AS description,
         f.id                          AS family_id,
         f.name                        AS family_name,
         NULL::uuid                    AS entity_id
  FROM public.wl_families f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wl_parents p WHERE p.family_id = f.id
  )

  UNION ALL

  -- families with no children
  SELECT 'no_children'::text, 'warning'::text,
         'Family has no children'::text,
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wl_children c WHERE c.family_id = f.id
  )

  UNION ALL

  -- children with no waitlist entry
  SELECT 'no_waitlist_entry'::text, 'warning'::text,
         'Child has no waitlist entry: ' || c.first_name || ' ' || c.last_name,
         c.family_id, f.name, c.id
  FROM public.wl_children c
  JOIN public.wl_families f ON f.id = c.family_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wl_waitlist_items wi WHERE wi.child_id = c.id
  )

  UNION ALL

  -- families with parents but no primary contact flagged
  SELECT 'no_primary_contact'::text, 'warning'::text,
         'Family has no primary contact set'::text,
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  WHERE EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = f.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.wl_parents p
      WHERE p.family_id = f.id AND p.primary_contact = true
    )

  UNION ALL

  -- families with more than one primary contact
  SELECT 'multiple_primary_contacts'::text, 'warning'::text,
         'Family has ' || count(*) || ' primary contacts',
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  JOIN public.wl_parents p ON p.family_id = f.id AND p.primary_contact = true
  GROUP BY f.id, f.name
  HAVING count(*) > 1

  UNION ALL

  -- family name doesn't match sorted parent last names
  SELECT 'name_drift'::text, 'error'::text,
         'Family name "' || f.name || '" doesn''t match parent last names',
         f.id, f.name, NULL::uuid
  FROM public.wl_families f
  WHERE f.name IS DISTINCT FROM (
    SELECT string_agg(sub.last_name, '-' ORDER BY sub.last_name)
    FROM (
      SELECT DISTINCT trim(p.last_name) AS last_name
      FROM public.wl_parents p
      WHERE p.family_id = f.id AND trim(p.last_name) <> ''
    ) sub
  )
  AND EXISTS (SELECT 1 FROM public.wl_parents p WHERE p.family_id = f.id)

  UNION ALL

  -- same email on multiple parents within the same org
  SELECT 'duplicate_email'::text, 'error'::text,
         'Email shared by multiple parents: ' || p.email,
         p.family_id, f.name, p.id
  FROM public.wl_parents p
  JOIN public.wl_families f ON f.id = p.family_id
  WHERE p.email IS NOT NULL
    AND (
      SELECT count(*) FROM public.wl_parents p2
      WHERE p2.email = p.email AND p2.organization_id = p.organization_id
    ) > 1;


-- ---------------------------------------------------------------------------
-- F. RECREATE TRIGGERS ON NEW VIEW NAMES
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_update_waitlist_items_view
  INSTEAD OF UPDATE ON public.waitlist_items_view
  FOR EACH ROW
  EXECUTE FUNCTION public.update_waitlist_items_view();

CREATE TRIGGER trg_update_task_from_view
  INSTEAD OF UPDATE ON public.waitlist_tasks_view
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_task_from_view();


-- ---------------------------------------------------------------------------
-- G. RESTORE GRANTS ON RECREATED VIEWS
-- DROP VIEW removes grants; restrictive default privileges mean new views
-- have no access until explicitly granted.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.waitlist_items_view   FROM anon;
REVOKE ALL ON TABLE public.waitlist_tasks_view   FROM anon;
REVOKE ALL ON TABLE public.data_integrity_issues FROM anon;

GRANT ALL    ON TABLE public.waitlist_items_view   TO authenticated;
GRANT ALL    ON TABLE public.waitlist_tasks_view   TO authenticated;
GRANT SELECT ON TABLE public.data_integrity_issues TO authenticated;


-- ---------------------------------------------------------------------------
-- H. CREATE modules TABLE
-- Central registry of available platform modules (wl, pm, vm, …).
-- Not tenant-scoped — all authenticated users can read.
-- LIFT manages rows directly via Supabase; no write policies for app users.
-- rls_auto_enable event trigger will enable RLS automatically on CREATE TABLE.
-- ---------------------------------------------------------------------------

CREATE TABLE public.modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,   -- e.g. "wl", "pm"
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modules TO authenticated;
REVOKE ALL ON TABLE public.modules FROM anon;

-- All authenticated users can read the module registry (not org-scoped)
CREATE POLICY "All staff can view modules"
  ON public.modules FOR SELECT TO authenticated
  USING (true);

-- Seed the waitlist module
INSERT INTO public.modules (slug, name, description)
VALUES ('wl', 'Waitlist', 'Waitlist management for child care providers');


-- ---------------------------------------------------------------------------
-- I. CREATE organization_modules TABLE
-- Records which modules are enabled for each organization.
-- SELECT scoped to the user's org; LIFT manages rows directly via Supabase.
-- rls_auto_enable event trigger will enable RLS automatically on CREATE TABLE.
-- ---------------------------------------------------------------------------

CREATE TABLE public.organization_modules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  module_id       uuid NOT NULL REFERENCES public.modules(id),
  enabled         boolean NOT NULL DEFAULT true,
  config          jsonb,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, module_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_modules TO authenticated;
REVOKE ALL ON TABLE public.organization_modules FROM anon;

-- Staff can see which modules their org has enabled
CREATE POLICY "Staff can view their org modules"
  ON public.organization_modules FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

-- Seed Wildwood's waitlist module (looks up both IDs by name/slug)
INSERT INTO public.organization_modules (organization_id, module_id)
SELECT o.id, m.id
FROM public.organizations o
CROSS JOIN public.modules m
WHERE o.name = 'Wildwood'
  AND m.slug = 'wl';


COMMIT;

-- =============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- Run these after applying to confirm everything looks right.
-- =============================================================================
--
-- 1. Confirm tables exist with new names:
--    SELECT tablename FROM pg_tables
--    WHERE schemaname = 'public'
--    ORDER BY tablename;
--
-- 2. Confirm views exist and return data:
--    SELECT count(*) FROM public.waitlist_items_view;
--    SELECT count(*) FROM public.waitlist_tasks_view;
--    SELECT count(*) FROM public.data_integrity_issues;
--
-- 3. Confirm module seed data:
--    SELECT * FROM public.modules;
--    SELECT om.*, o.name AS org_name, m.slug
--    FROM public.organization_modules om
--    JOIN public.organizations o ON o.id = om.organization_id
--    JOIN public.modules m ON m.id = om.module_id;
--
-- 4. Confirm old table names no longer exist (should return 0 rows):
--    SELECT tablename FROM pg_tables
--    WHERE schemaname = 'public'
--    AND tablename IN ('families','children','parents',
--                      'school_terms','waitlist_items','tasks');
-- =============================================================================

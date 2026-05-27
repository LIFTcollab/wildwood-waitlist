-- Phase 1 fix — Update trigger functions to use wl_ prefixed table names
-- These were missed in phase1_wl_prefix.sql because they were not captured
-- in wildwood_schema.sql. All five functions reference old table names and
-- fail at runtime, causing any UPDATE/INSERT/DELETE on wl_parents,
-- wl_children, or wl_waitlist_items to roll back silently.

-- A. Core helper: recompute a family's priority rank and status
CREATE OR REPLACE FUNCTION public.fn_recompute_family_priority(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prank integer;
BEGIN
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.wl_parents p
        WHERE p.family_id = p_family_id
          AND p.school_history::text = 'Board'
      ) THEN 1
      WHEN EXISTS (
        SELECT 1 FROM public.wl_parents p
        WHERE p.family_id = p_family_id
          AND p.school_history::text = 'Teacher'
      ) THEN 2
      WHEN EXISTS (
        SELECT 1 FROM public.wl_parents p
        WHERE p.family_id = p_family_id
          AND p.school_history::text = 'Alumni'
      ) THEN 3
      WHEN (
        SELECT COUNT(DISTINCT sib.id)
        FROM public.wl_children sib
        JOIN public.wl_waitlist_items wi ON wi.child_id = sib.id
        WHERE sib.family_id = p_family_id
          AND wi.status::text = ANY(ARRAY['Enrolled', 'Waitlisted'])
      ) > 1 THEN 4
      ELSE 5
    END INTO v_prank;

  UPDATE public.wl_families
  SET
    priority_rank   = v_prank,
    priority_status = CASE v_prank
      WHEN 1 THEN 'Board'
      WHEN 2 THEN 'Teacher'
      WHEN 3 THEN 'Alumni'
      WHEN 4 THEN 'Sibling'
      ELSE        'Regular'
    END
  WHERE id = p_family_id;
END;
$$;

-- B. Core helper: recompute a family's display name from parent last names
CREATE OR REPLACE FUNCTION public.fn_recompute_family_name(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT string_agg(last_name, '-' ORDER BY last_name)
  INTO v_name
  FROM (
    SELECT DISTINCT last_name
    FROM public.wl_parents
    WHERE family_id = p_family_id
      AND last_name IS NOT NULL
      AND last_name <> ''
  ) t;

  IF v_name IS NOT NULL AND v_name <> '' THEN
    UPDATE public.wl_families SET name = v_name WHERE id = p_family_id;
  END IF;
END;
$$;

-- C. Trigger wrapper: recompute priority when a waitlist item changes
--    (reads wl_children to find the family_id)
CREATE OR REPLACE FUNCTION public.fn_trg_waitlist_items_priority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_family_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT family_id INTO v_family_id
    FROM public.wl_children WHERE id = OLD.child_id;
  ELSE
    SELECT family_id INTO v_family_id
    FROM public.wl_children WHERE id = NEW.child_id;
  END IF;

  IF v_family_id IS NOT NULL THEN
    PERFORM public.fn_recompute_family_priority(v_family_id);
  END IF;
  RETURN NULL;
END;
$$;

-- D. Revoke EXECUTE from PUBLIC on all five trigger/helper functions
--    (already revoked for the wrappers; reapply after CREATE OR REPLACE)
REVOKE EXECUTE ON FUNCTION public.fn_recompute_family_priority(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recompute_family_name(uuid)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_trg_waitlist_items_priority()   FROM PUBLIC;

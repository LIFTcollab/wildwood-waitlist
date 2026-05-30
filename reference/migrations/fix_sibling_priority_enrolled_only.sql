-- =============================================================================
-- Migration: fix_sibling_priority_enrolled_only
-- Applied:   2026-05-30
-- =============================================================================
-- Change sibling priority criteria: was Enrolled OR Waitlisted; now Enrolled only.
-- A family earns "Sibling" priority (rank 4) only when 2+ of their children
-- have an Enrolled waitlist entry — not merely Waitlisted.
-- =============================================================================

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
          WHERE sib.family_id = p_family_id AND wi.status::text = 'Enrolled') > 1 THEN 4
    ELSE 5
  END INTO v_prank;
  UPDATE public.wl_families
     SET priority_rank = v_prank,
         priority_status = CASE v_prank WHEN 1 THEN 'Board' WHEN 2 THEN 'Teacher'
                                        WHEN 3 THEN 'Alumni' WHEN 4 THEN 'Sibling' ELSE 'Regular' END
   WHERE id = p_family_id;
END;
$$;

-- Re-revoke EXECUTE: CREATE OR REPLACE silently re-grants to anon/authenticated
-- (Supabase default function privileges). Must revoke immediately after every
-- CREATE OR REPLACE on an internal/trigger function.
REVOKE EXECUTE ON FUNCTION public.fn_recompute_family_priority(uuid) FROM PUBLIC, anon, authenticated;

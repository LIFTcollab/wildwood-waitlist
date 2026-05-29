-- =============================================================================
-- ATOMIC "ADD CHILD TO WAITLIST" — wl_create_waitlist_entry() RPC
-- Applied: 2026-05-28  (Supabase project qxpftvnxorzwmawzhcjo)
-- =============================================================================
-- Problem:
--   createWaitlistEntry() performed three separate inserts (family → child →
--   waitlist item) as three separate PostgREST calls. supabase-js sends each as
--   its own transaction, so a failure on a later step (e.g. a bad term_id) left
--   the already-inserted family and/or child behind as orphaned rows — exactly
--   the no_children / no_waitlist_entry states the integrity view flags.
--
-- Fix:
--   Move all three inserts into one SECURITY INVOKER function so they run in a
--   single transaction. RLS and the role check still apply (invoker rights), and
--   a mid-way failure rolls the whole operation back. The function also verifies
--   a supplied family_id belongs to the caller's org (cross-tenant guard).
--
-- Verified (in rolled-back transactions, impersonating an Admin JWT):
--   - happy path creates family+child+item together
--   - forcing the 3rd insert to fail leaves zero orphan family/child rows
--   - a family_id outside the caller's org raises "Family not found"
-- =============================================================================

CREATE OR REPLACE FUNCTION public.wl_create_waitlist_entry(
  p_family_id    uuid,
  p_family_name  text,
  p_first_name   text,
  p_last_name    text,
  p_dob          date,
  p_term_id      uuid,
  p_status       text,
  p_classroom    text,
  p_date_applied date,
  p_notes        text
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
    v_child,
    p_term_id,
    v_org,
    NULLIF(p_status, '')::public.waitlist_status_enum,
    NULLIF(p_classroom, '')::public.classroom_enum,
    p_date_applied,
    NULLIF(p_notes, '')
  )
  RETURNING id INTO v_item;

  RETURN jsonb_build_object('item_id', v_item, 'child_id', v_child);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wl_create_waitlist_entry(
  uuid, text, text, text, date, uuid, text, text, date, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wl_create_waitlist_entry(
  uuid, text, text, text, date, uuid, text, text, date, text
) TO authenticated;

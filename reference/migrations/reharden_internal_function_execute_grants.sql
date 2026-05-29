-- =============================================================================
-- RE-HARDEN internal/trigger function EXECUTE grants
-- Applied: 2026-05-28  (Supabase project qxpftvnxorzwmawzhcjo)
-- =============================================================================
-- Problem (surfaced during the 2026-05-28 schema regeneration):
--   The 2026-05-26 hardening revoked EXECUTE on internal/trigger functions from
--   PUBLIC. But the Phase 1 trigger-function fix (2026-05-27) recreated several
--   of them with CREATE OR REPLACE, which re-applies Supabase's default function
--   privileges (EXECUTE to anon/authenticated). Two of the recreated helpers —
--   fn_recompute_family_priority(uuid) and fn_recompute_family_name(uuid) —
--   return a value (not a trigger), so they were reachable via PostgREST /rpc by
--   anon. Being SECURITY DEFINER, an anon caller could force a priority/name
--   recompute on any family id (cross-org). Low severity (recompute is
--   idempotent to the legitimate value; no arbitrary writes or data exfil), but
--   an unintended SECURITY DEFINER exposure.
--
-- Fix:
--   Re-revoke EXECUTE from PUBLIC/anon/authenticated on every internal/trigger
--   function. These are only ever invoked by triggers, whose definer context
--   retains EXECUTE, so normal operation is unaffected. Also restrict the
--   atomic add-child RPC to authenticated (not anon).
--
-- Verify (expect none of these in the result):
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   cross join lateral aclexplode(p.proacl) a
--   where n.nspname='public' and a.privilege_type='EXECUTE'
--     and (a.grantee=0 or (select rolname from pg_roles where oid=a.grantee) in ('anon','authenticated'))
--     and p.proname like 'fn_%';
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_recompute_family_name(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_recompute_family_priority(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trg_children_family_priority()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trg_parents_family_name()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trg_parents_priority()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trg_waitlist_items_priority()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_task_from_view()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_waitlist_items_view()          FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.wl_create_waitlist_entry(
  uuid, text, text, text, date, uuid, text, text, date, text
) FROM PUBLIC, anon;

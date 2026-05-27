-- Phase 1.4 — Add slug, type, and domain to organizations
-- Additive only. No existing columns touched.
-- Run after: phase1_wl_prefix.sql

-- A. Create org_type_enum
CREATE TYPE public.org_type_enum AS ENUM (
  'nonprofit',
  'business_sponsor',
  'foundation',
  'community_org',
  'government',
  'lift_internal'
);

-- B. Add columns (nullable first so existing rows don't violate NOT NULL)
ALTER TABLE public.organizations
  ADD COLUMN slug   text UNIQUE,
  ADD COLUMN type   public.org_type_enum,
  ADD COLUMN domain text;

-- C. Seed Wildwood
UPDATE public.organizations
   SET slug = 'wildwood',
       type = 'nonprofit'
 WHERE name = 'Wildwood School';

-- D. Enforce slug NOT NULL now that existing rows have a value
ALTER TABLE public.organizations
  ALTER COLUMN slug SET NOT NULL;

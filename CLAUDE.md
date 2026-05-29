# CLAUDE.md — Wildwood Waitlist / LiftCollab Platform

Context for Claude Code sessions. Keep this file current — update it when we establish new conventions or make architectural decisions.

---

## Project in One Sentence

A staff-facing waitlist management tool for **Wildwood** (nature-based preschool), built as the first module (`wl_`) of the **LiftCollab** multi-tenant nonprofit platform.

- **Live app:** https://wildwood.liftcollab.app (wildwood.liftcollab.org redirects here)
- **Supabase project:** `qxpftvnxorzwmawzhcjo`
- **Vercel project:** wildwood.vercel.app (auto-deploys on push to `main`)

---
## Strategic & Architectural Context

Before making changes, review these documents:
- STRATEGY.md — LIFT's strategic vision and Head/Heart/Hands framework
- ARCHITECTURE.md — Multi-tenant, multi-module platform architecture
- ROADMAP.md — Phased implementation sequence
- CONVENTIONS.md — Coding conventions
- PROJECT.md — Current state of the codebase

---
## How to Work With Me

I'm **Steve D'Amico** (steve@liftcollab.org). I'm comfortable editing config and small code snippets but I am **not a developer**. Treat me as someone learning the codebase.

- **Explain before doing.** Especially the first time you use a new pattern — one or two sentences is enough.
- **Run commands yourself** when you can. Tell me what you ran and why.
- **When you need me to act** (paste an env var, click a link, create a Vercel project), pause and say so explicitly: "I need you to do X. Tell me when done."
- **Commit often** with clear messages after each working change. I want a clean undo history.
- **Be honest about uncertainty.** If you're not sure something will work, say so before writing 200 lines.
- **If I push back, reconsider** — I may have context you don't.
- **Update this file** when we establish new conventions or make architectural decisions.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server Components default |
| Language | TypeScript | Strict — no `any` |
| Auth | `@supabase/ssr` | Magic link only, no passwords |
| Database | Supabase (Postgres 17 + RLS) | Project: `qxpftvnxorzwmawzhcjo` |
| Styling | Tailwind CSS v4 | CSS-variable theme in `globals.css` |
| Charts | Recharts | Custom palette only |
| Email | Resend via Supabase custom SMTP | Already configured |
| Hosting | Vercel | Auto-deploy on `main` |

---

## Project Structure

```
wildwood-waitlist/
├── app/
│   ├── (app)/                         # Protected routes — layout does auth check
│   │   ├── layout.tsx                 # Auth guard, TopNav, user card
│   │   ├── dashboard/page.tsx         # Stat cards + term charts + open tasks
│   │   ├── waitlist/page.tsx          # WaitlistTable (server data fetch)
│   │   ├── families/page.tsx          # Redirects to /settings
│   │   └── settings/page.tsx          # Admin page: Families + Terms + DataIntegrity
│   ├── (public)/login/                # Magic link login form
│   ├── auth/callback/route.ts         # Magic link exchange → session → /dashboard
│   ├── layout.tsx                     # Root — Google Fonts (Source Serif 4, Inter, JetBrains Mono)
│   └── globals.css                    # CSS custom properties + Tailwind v4 @theme
├── modules/
│   └── waitlist/                      # wl_ module — all waitlist-specific code
│       ├── components/                # All UI components
│       │   ├── WaitlistTable.tsx      # Filterable/sortable table
│       │   ├── ChildDetailPanel.tsx   # Slide-in: child/waitlist edit + parent edit + tasks
│       │   ├── AddChildModal.tsx      # 3-step modal: Family → Child → Entry
│       │   ├── FamiliesTable.tsx      # Family list table
│       │   ├── FamilyDetailPanel.tsx  # Slide-in: family + parents (full CRUD)
│       │   ├── TermsManager.tsx       # Term CRUD on Admin page
│       │   ├── DataIntegrityPanel.tsx # Integrity checks (Admin only)
│       │   ├── TopNav.tsx             # Nav: Dashboard · Waitlist · Admin
│       │   └── ...                    # Dashboard charts, tasks table, sign-out
│       ├── lib/actions/               # Server Actions — all DB mutations
│       │   ├── waitlist.ts            # updateWaitlistItem, createTask
│       │   ├── children.ts            # createWaitlistEntry (3-step)
│       │   ├── families.ts            # createFamily, deleteFamily, updateParent,
│       │   │                          #   addParent, deleteParent, moveParent/Child
│       │   ├── tasks.ts               # updateTask
│       │   ├── terms.ts               # createTerm, updateTerm, deleteTerm
│       │   └── integrity.ts           # checkDataIntegrity
│       └── types/index.ts             # WaitlistItem, SchoolTerm types
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # Browser client
│   │   └── server.ts                  # Server client (cookies)
│   └── org-context.ts                 # getOrgSlug() — reads x-org-slug header set by proxy
├── proxy.ts                           # Subdomain routing + session refresh (Next.js 16 "proxy")
├── reference/
│   ├── wildwood_schema.sql            # Authoritative DB schema + change log
│   └── wildwood-hybrid.html          # Design reference — open to see the look
├── PROJECT.md                         # Current feature state + file map
└── CONVENTIONS.md                     # Platform architecture + patterns
```

---

## Conventions

### Server vs Client Components

- **Default to Server Components.** Use `"use client"` only for interactivity, hooks, or browser APIs.
- Data fetching happens in Server Components via `lib/supabase/server.ts`.
- Never call Supabase from the browser client unless explicitly needed (no current use cases).

### Data Flow

```
Page (Server Component) → fetches data → passes props to Client Components
Client Component → calls Server Action on user interaction
Server Action → uses server Supabase client → calls revalidatePath()
```

### Supabase Clients

```typescript
// In Server Components and Server Actions:
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// In Client Components (rare):
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

### Server Actions

- All DB mutations go in `modules/<module>/lib/actions/*.ts`.
- Always start with `supabase.auth.getUser()` and check for auth.
- Role check: read from `user_profiles.organization_id` (never from request params or body).
- Return `{ error: string | null }` + data when needed.
- Call `revalidatePath()` for every route showing the changed data.

### Views

- Use views for reads that join multiple tables. Use base tables for writes.
- **All views must have `WITH (security_invoker = true)`** — Supabase Advisor will flag this.
- Write through views via `INSTEAD OF UPDATE` triggers only (current: `waitlist_items_view`, `waitlist_tasks_view`).

### File Naming

- React components: `PascalCase.tsx`
- Utilities/helpers: `camelCase.ts`
- Route segments: `lowercase/`

### Styling

- Tailwind only. No CSS modules, no styled-components.
- Use CSS custom property tokens (`text-green`, `bg-terra-soft`) — **never hardcode hex colors**.
- Full token reference in `globals.css` and `CONVENTIONS.md`.

---

## ⚠️ Creating New Tables — CRITICAL

This project opted in to Supabase's **restrictive default privileges** (2026-05-12).
New tables in `public` are NOT visible to the Data API without explicit grants.
A missing grant shows as PostgREST error `42501` ("permission denied for table X").

**Every new table migration must have all three steps:**

```sql
-- 1. Create
CREATE TABLE public.your_table (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  -- columns...
  created_at      timestamptz DEFAULT now()
);

-- 2. Grant (RLS gates row-level access; this enables the Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;

-- 3. RLS — one SELECT + separate INSERT/UPDATE/DELETE (never FOR ALL)
CREATE POLICY "Staff can view" ON public.your_table FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins/Directors can insert" ON public.your_table FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );
-- (repeat for UPDATE and DELETE)
```

---

## Security Rules — Non-Negotiable

1. **Never use service_role key.** Anon key + RLS is the model.
2. **Always rely on RLS.** Never bypass.
3. **Never `FOR ALL` RLS policies** — use one SELECT + separate INSERT/UPDATE/DELETE.
4. **Views must be `WITH (security_invoker = true)`** — never SECURITY DEFINER views.
5. **All SECURITY DEFINER functions** must have `SET search_path = ''`.
6. **`canEdit` checked in every component** — Viewer role is read-only throughout.
7. **Explicit GRANT on every new table** — see the three-step pattern above.
8. Internal/trigger functions have `EXECUTE` revoked from `PUBLIC`.

---

## Supabase Project

| Setting | Value |
|---|---|
| Project ID | `qxpftvnxorzwmawzhcjo` |
| Region | us-east-1 |
| Postgres | 17.6.1.104 |
| Auth | Magic link only (no passwords) |
| Email | Resend (custom SMTP) |
| Default privileges | Restrictive (opted in 2026-05-12) |
| Test user | `steve@liftcollab.org` (Admin) |

**Anon key:** in `.env.local` (gitignored). Get it from Supabase Dashboard → Settings → API.

**Anon-accessible RPCs:** only `check_email_exists(text)` — used pre-login before a session exists.

---

## Database Overview

11 tables, 4 views, RLS on everything.
Full schema in `reference/wildwood_schema.sql`.

**Tables:** `organizations`, `modules`, `organization_modules`, `wl_families`, `wl_children`, `wl_parents`, `wl_school_terms`, `wl_waitlist_items`, `wl_tasks`, `user_profiles`, `rate_limit_log`

**Views:** `waitlist_items_view`, `waitlist_tasks_view`, `user_profiles_view`, `data_integrity_issues`

**RLS helpers:**
- `current_user_org()` — SECURITY DEFINER, returns caller's `organization_id`
- `current_user_role()` — SECURITY DEFINER, returns caller's role enum

**Triggers:**
- `on_auth_user_created` → `handle_new_user()` — creates `user_profiles` row with NULL role/org on signup
- `trg_update_waitlist_items_view` → `update_waitlist_items_view()` — handles inline editing
- `trg_update_task_from_view` → `fn_update_task_from_view()` — handles task edits
- `ensure_rls` (event trigger) → `rls_auto_enable()` — auto-enables RLS on new tables

---

## Design System

**Hybrid editorial-operational** — warm like a small school, efficient like a modern internal tool.
Visual reference: open `reference/wildwood-hybrid.html` in a browser.

### Typography (3 fonts, Google Fonts)

- **Source Serif 4** (`font-serif`) — page titles, child names, italic accents. Human moments only.
- **Inter** (`font-sans`) — body, labels, buttons. Default for everything.
- **JetBrains Mono** (`font-mono`) — IDs, dates, classroom codes, numbers.

### Color Tokens

All defined as CSS custom properties in `globals.css` and mapped to Tailwind in `@theme inline`:

```
bg, surface, surface-warm, surface-hover
border, border-strong
text, text-2, text-3
green, green-deep, green-soft
gold, gold-soft
terra, terra-soft
blue, blue-soft
gray-soft
```

### Semantic Colors

| Context | Token |
|---|---|
| Enrolled / Teacher priority | green |
| Waitlisted / Alumni priority | gold |
| Declined / Board priority / Urgent | terra |
| Sibling priority | blue |
| Regular priority / Inactive | gray-soft |
| Primary action buttons | green |
| Destructive / error | terra |

---

## Running the Project

```bash
npm run dev      # dev server at localhost:3000
npm run build    # type-check + production build
```

**Env vars** (`.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://qxpftvnxorzwmawzhcjo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase Dashboard>
NEXT_PUBLIC_DEFAULT_ORG_SLUG=wildwood   # used on plain localhost (no subdomain)
```

---

## Current Phase: Waitlist Stabilization (before Phase 3)

Phases 1 and 2 complete. App live at `wildwood.liftcollab.app`.
Phase 3 (program management) is on hold until the waitlist app is thoroughly
tested and operational by Wildwood staff.

**Active focus — four areas:**
1. **Missing features** — gaps surfaced by the Wildwood director during user testing
2. **Data quality** — both cleaning existing records and enforcing better data entry
3. **Minimal reporting** — likely a simple export or printable summary; scope TBD
4. **Security** — post-Phase-2 security review completed (three findings fixed; see log)

**Known gap — no user management UI:**
Admins cannot invite or manage staff accounts from within the app. New users must
be configured manually in Supabase (set role + organization_id in user_profiles).
This is a missing feature to address during stabilization.

**Not yet built (Phases 3+):**
- Program management module (`pm_`)
- Multi-tenant onboarding tools
- Second tenant

Full platform architecture in ARCHITECTURE.md and CONVENTIONS.md.

---

## Known Gotchas

- **Magic link redirect URL must be in Supabase's allowed list.** `wildwood.liftcollab.app/auth/callback`, `wildwood.liftcollab.org/auth/callback`, and `localhost:3000/auth/callback` are all in the allowlist. Supabase Site URL is `https://wildwood.liftcollab.app`.
- **RLS errors look like empty results.** If a query returns `[]` unexpectedly, check auth + policy — Supabase hides rows silently.
- **`42501` = missing GRANT, not an RLS issue.** Run the three-step new-table pattern.
- **`NEXT_PUBLIC_` vars must NOT be Sensitive in Vercel** — they're baked in at build time.
- **`school_term_name_enum` was removed from `waitlist_items_view`** (2026-05-26). `term_name` is now plain text — no `ALTER TYPE` needed for new terms.
- **`tasks.name` column does not exist** — task name is computed live in `waitlist_tasks_view` as `"First Last: Term"`.
- **`data_integrity_issues`** is a DB view used by `modules/waitlist/lib/actions/integrity.ts`. It now has `security_invoker = true` and is documented in `reference/wildwood_schema.sql` (regenerated 2026-05-28).
- **Supabase Advisor will flag `current_user_org`, `current_user_role`, and `get_auth_users`** as callable via `/rpc/`. These 3 warnings are intentional and irreducible without moving functions to a private schema.
- **`CREATE OR REPLACE FUNCTION` re-applies Supabase's default function privileges** — it silently re-grants `EXECUTE` to `anon`/`authenticated` even on internal/trigger functions you previously revoked. This bit us twice (the Phase 1 trigger-function fix re-exposed `fn_recompute_*` to anon via `/rpc/`). After creating or replacing ANY internal/trigger function, immediately `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` and re-grant only what the app needs, then verify. (Default privileges were only changed for TABLES/SEQUENCES, not FUNCTIONS.)
- **`INSTEAD OF UPDATE` trigger functions on views must be `SECURITY INVOKER`** — if `SECURITY DEFINER`, their inner writes bypass base-table RLS, letting any authenticated user (incl. Viewers) write through the view. Both view-update triggers (`update_waitlist_items_view`, `fn_update_task_from_view`) are now INVOKER.

---

## Project Log

Append decisions and notes here chronologically. Most recent at bottom.

- *Pre-build:* DB schema designed and secured. RLS policies, anon-revocation, with-check constraints, rate-limit hardening, user_profiles_view restriction, search_path hardening, and pg_cron cleanup job all applied. Schema documented in `reference/wildwood_schema.sql`.
- *2026-05-12:* Opted in to Supabase's new restrictive default privileges. New tables in `public` now require explicit `GRANT` statements.
- *2026-05-12:* Design direction finalized as hybrid editorial-operational. Three prototypes evaluated; final design combines warm palette, efficient table layouts, and visual metric components. Reference: `reference/wildwood-hybrid.html`. Typography: Source Serif 4 + Inter + JetBrains Mono. Primary accent: forest green `#4a7c59`.
- *2026-05-24:* v1 shipped. Login + dashboard live at wildwood.vercel.app. All 9 BUILD_PLAN success criteria met. `NEXT_PUBLIC_` vars must NOT be Sensitive in Vercel.
- *2026-05-24:* `/waitlist` page shipped. Filterable/sortable table, priority-ranked default, 25-per-page pagination, slide-in detail panel with inline editing.
- *2026-05-24:* Waitlist enhanced: inline editing (Admin/Director), column sorting, multi-select filter dropdowns with OR matching.
- *2026-05-26:* Security hardening: 17 Supabase Advisor warnings → 6 (all intentional). Revoked EXECUTE on internal functions from PUBLIC. Split FOR ALL RLS policies into per-operation. Fixed auth.uid() per-row re-evaluation in user_profiles.
- *2026-05-26:* Term management UI shipped. `school_term_name_enum` cast dropped from `waitlist_items_view` (term_name is now plain text). `/settings` page with TermsManager component added.
- *2026-05-26:* `waitlist_tasks_view` fixed to have `security_invoker = true` (was missing after a recreate). `tasks.name` column dropped — task name now computed live in the view.
- *2026-05-27:* Created `PROJECT.md` (current state), `CONVENTIONS.md` (multi-tenant platform architecture), and updated `CLAUDE.md`. Platform renamed to LiftCollab internally. Module prefix convention established (`wl_` for waitlist). Future architectural steps documented.
- *2026-05-27:* Added `STRATEGY.md` (LIFT vision, Head/Heart/Hands, funder positioning, Wildwood origin story), `ARCHITECTURE.md` (multi-tenant DB schema, subdomain routing, code organization), and `ROADMAP.md` (5-phase implementation plan). CLAUDE.md updated to reflect Phase 1 as active work. CONVENTIONS.md reconciled against ARCHITECTURE.md.
- *2026-05-27:* Phase 1 complete. Executed all steps: code into `/modules/waitlist/`, DB tables renamed to `wl_` prefix, `modules` and `organization_modules` tables added, `slug`/`type`/`domain` added to `organizations`. Regression testing found and fixed two bugs introduced by the table rename: (1) embedded join queries in FamilyDetailPanel/AddChildModal still used old table names — fixed with PostgREST alias syntax (`children:wl_children(...)`); (2) six trigger functions (`fn_recompute_family_priority`, `fn_recompute_family_name`, `fn_trg_waitlist_items_priority`, and wrappers) still referenced old table names, causing all `wl_parents` UPDATEs to silently roll back — fixed in `phase1_fix_trigger_functions.sql` migration. These functions were missing from the schema file and therefore not caught in the original rename migration.
- *2026-05-28:* Post-Phase-1 feature work, bug fixes, Phase 2, and security review (see prior entries). Phase 2 complete: `proxy.ts` implements subdomain routing (Next.js 16 renames middleware → proxy); `lib/org-context.ts` provides `getOrgSlug()` for server components; `next.config.ts` adds host-based 301 redirect from `.org` to `.app`; `NEXT_PUBLIC_DEFAULT_ORG_SLUG` added to env for local dev. Supabase Site URL updated to `wildwood.liftcollab.app`; auth callback allowlist updated. All 25 local commits pushed to GitHub; Vercel deployed current code. Both `wildwood.liftcollab.app` (canonical) and `wildwood.liftcollab.org` (redirects to `.app`) verified working. Post-Phase-2 security review (Opus 4): three findings fixed — (1) `data_integrity_issues` view missing `security_invoker=true` + no auth check in server action; (2) `addParent` accepted client-supplied `organization_id` with no auth check (same gap in `updateParent`/`deleteParent`); (3) `OpenTasksTable` edit button visible to Viewer role. All fixed, committed, deployed. Wildwood director account configured (Director role, correct org); user testing in progress. Bug fixes: AddChild modal submit always disabled (term_id not pre-populated); task name incorrectly editable on dashboard; primary contact checkbox uncontrolled→controlled error + double-toggle bug; school history change not reflecting in Families table (added priority_status/rank re-fetch after save). Features: term deletion (Admin only, with guard); "New family" option in parent move picker; renamed "Remove" → "Delete" with stronger confirm copy; empty-family banner with delete prompt; orphaned_parent check added to `data_integrity_issues` DB view and DataIntegrityPanel; enriched family display in Waitlist panel (email, phone, school history badges); section-level parent editing in Waitlist panel (edit/add/delete parents without leaving the panel); Families page consolidated into Admin page (`/settings`) — nav simplified to Dashboard · Waitlist · Admin; `/families` redirects to `/settings`; `updateFamilyName` dead code removed. Four bugs fixed after code review: `updateParent`/`addParent`/`deleteParent` missing `revalidatePath("/waitlist")`; priority not refreshed after remove/move parent in FamilyDetailPanel; stale family data briefly shown on child switch; dead `updateFamilyName` action.
- *2026-05-28:* Second security review (Opus) + schema regeneration. Findings fixed and deployed: (1) **HIGH** — `update_waitlist_items_view()` INSTEAD OF trigger was `SECURITY DEFINER`, so Viewers could write through `waitlist_items_view` and bypass base-table RLS; flipped to `SECURITY INVOKER` and added an auth+role check to `updateWaitlistItem`. (2) Cross-org guards — `moveParentToFamily`/`moveChildToFamily`/`createWaitlistEntry` now verify the target family belongs to the caller's org (mirrors `addParent`). (3) `deleteTerm` tightened to Admin-only (matches UI). (4) `ChildDetailPanel` add-task input gated behind `canEdit`; task status/description edits routed through the `updateTask` server action instead of direct browser writes. (5) **Atomicity** — added `wl_create_waitlist_entry()` RPC (SECURITY INVOKER) so the family→child→waitlist-item inserts run in one transaction; `createWaitlistEntry` now calls it (no more orphaned rows on partial failure). (6) `proxy.ts` now strips any client-supplied `x-org-slug` before setting it. (7) **Function-grant re-harden** — discovered the Phase 1 trigger-function recreation had re-granted `EXECUTE` to anon/authenticated on `fn_recompute_*`/`fn_trg_*` (default-privileges trap); re-revoked from PUBLIC/anon/authenticated on all internal/trigger functions. Migrations saved in `reference/migrations/`. (8) Regenerated `reference/wildwood_schema.sql` from the live DB — it had drifted (old un-prefixed names; missing `modules`/`organization_modules`, `orphaned_parent` check, `school_history` 'Board' value). It is now authoritative. Known mismatch noted (not changed): `wl_tasks` has no `priority` column but the dashboard's "urgent" count queries one, so it always reads 0. Also: removed the unused dashboard topbar (breadcrumb + inactive Export/Add-child buttons); darkened secondary text tokens (`--text-2`, `--text-3`) in `globals.css` for table readability.

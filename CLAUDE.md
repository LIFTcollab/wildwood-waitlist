# CLAUDE.md — Wildwood Waitlist / LiftCollab Platform

Context for Claude Code sessions. Keep this file current — update it when we establish new conventions or make architectural decisions.

---

## Project in One Sentence

A staff-facing waitlist management tool for **Wildwood** (nature-based preschool), built as the first module (`wl_`) of the **LiftCollab** multi-tenant nonprofit platform.

- **Live app:** https://wildwood.liftcollab.org
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
│   ├── (app)/                    # Protected — layout.tsx does auth check + nav
│   │   ├── dashboard/page.tsx
│   │   ├── waitlist/page.tsx
│   │   ├── families/page.tsx
│   │   └── settings/page.tsx
│   ├── (public)/login/           # Magic link login form
│   ├── actions/                  # Server Actions — all DB mutations live here
│   │   ├── waitlist.ts           # updateWaitlistItem, createTask
│   │   ├── children.ts           # createWaitlistEntry (3-step)
│   │   ├── families.ts           # updateFamilyName, updateParent, addParent, deleteParent, moveParent/Child
│   │   ├── tasks.ts              # updateTask
│   │   ├── terms.ts              # createTerm, updateTerm
│   │   └── integrity.ts          # checkDataIntegrity
│   ├── auth/callback/route.ts    # Magic link exchange
│   ├── layout.tsx                # Root — Google Fonts (Source Serif 4, Inter, JetBrains Mono)
│   └── globals.css               # CSS custom properties + Tailwind v4 @theme
├── components/dashboard/         # All UI components
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   └── server.ts             # Server client (cookies)
│   └── types/waitlist.ts         # WaitlistItem, SchoolTerm types
├── middleware.ts                 # Session refresh (every request)
├── reference/
│   ├── wildwood_schema.sql       # Authoritative DB schema + change log
│   └── wildwood-hybrid.html      # Design reference — open to see the look
├── PROJECT.md                    # Current feature state + file map
└── CONVENTIONS.md                # Platform architecture + patterns
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

- All DB mutations go in `app/actions/*.ts` (or `app/actions/<module>/` as modules grow).
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

9 tables, 3 views, RLS on everything.
Full schema in `reference/wildwood_schema.sql`.

**Tables:** `organizations`, `families`, `children`, `parents`, `school_terms`, `waitlist_items`, `tasks`, `user_profiles`, `rate_limit_log`

**Views:** `waitlist_items_view`, `waitlist_tasks_view`, `user_profiles_view`

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
```

---

## Current Phase: Phase 1 — Platform Foundation

Actively refactoring Wildwood into the multi-tenant, multi-module pattern. See ROADMAP.md for the full sequence.

**Phase 1 tasks (in order):**
1. Refactor app code into `/modules/waitlist/` structure — no functionality change
2. Rename DB tables with `wl_` prefix (coordinated migration — all queries updated in sync)
3. Add `modules` and `organization_modules` tables (module registry); seed for Wildwood
4. Add `slug` and `type` columns to `organizations`
5. Full regression test of Wildwood functionality

**Not yet built (Phases 2+):**
- Subdomain middleware (`wildwood.liftcollab.app` → org context)
- Domain migration from `.org` to `.app`
- Program management module (`pm_`)
- Second tenant

Full platform architecture in ARCHITECTURE.md and CONVENTIONS.md.

---

## Known Gotchas

- **Magic link redirect URL must be in Supabase's allowed list.** Both `localhost:3000/auth/callback` and the Vercel production URL.
- **RLS errors look like empty results.** If a query returns `[]` unexpectedly, check auth + policy — Supabase hides rows silently.
- **`42501` = missing GRANT, not an RLS issue.** Run the three-step new-table pattern.
- **`NEXT_PUBLIC_` vars must NOT be Sensitive in Vercel** — they're baked in at build time.
- **`school_term_name_enum` was removed from `waitlist_items_view`** (2026-05-26). `term_name` is now plain text — no `ALTER TYPE` needed for new terms.
- **`tasks.name` column does not exist** — task name is computed live in `waitlist_tasks_view` as `"First Last: Term"`.
- **`data_integrity_issues`** is a DB view used by `app/actions/integrity.ts`. It must exist in Supabase; it's not in the main schema file.
- **Supabase Advisor will flag `current_user_org`, `current_user_role`, and `get_auth_users`** as callable via `/rpc/`. These 3 warnings are intentional and irreducible without moving functions to a private schema.

---

## Project Log

Append decisions and notes here chronologically. Most recent at bottom.

- *Pre-build:* DB schema designed and secured. RLS policies, anon-revocation, with-check constraints, rate-limit hardening, user_profiles_view restriction, search_path hardening, and pg_cron cleanup job all applied. Schema documented in `reference/wildwood_schema.sql`.
- *2026-05-12:* Opted in to Supabase's new restrictive default privileges. New tables in `public` now require explicit `GRANT` statements.
- *2026-05-12:* Design direction finalized as hybrid editorial-operational. Three prototypes evaluated; final design combines warm palette, efficient table layouts, and visual metric components. Reference: `reference/wildwood-hybrid.html`. Typography: Source Serif 4 + Inter + JetBrains Mono. Primary accent: forest green `#4a7c59`.
- *2026-05-24:* v1 shipped. Login + dashboard live at wildwood.vercel.app. All 9 BUILD_PLAN success criteria met. Renamed `proxy.ts` → `middleware.ts` (Vercel edge requires this name). `NEXT_PUBLIC_` vars must NOT be Sensitive in Vercel.
- *2026-05-24:* `/waitlist` page shipped. Filterable/sortable table, priority-ranked default, 25-per-page pagination, slide-in detail panel with inline editing.
- *2026-05-24:* Waitlist enhanced: inline editing (Admin/Director), column sorting, multi-select filter dropdowns with OR matching.
- *2026-05-26:* Security hardening: 17 Supabase Advisor warnings → 6 (all intentional). Revoked EXECUTE on internal functions from PUBLIC. Split FOR ALL RLS policies into per-operation. Fixed auth.uid() per-row re-evaluation in user_profiles.
- *2026-05-26:* Term management UI shipped. `school_term_name_enum` cast dropped from `waitlist_items_view` (term_name is now plain text). `/settings` page with TermsManager component added.
- *2026-05-26:* `waitlist_tasks_view` fixed to have `security_invoker = true` (was missing after a recreate). `tasks.name` column dropped — task name now computed live in the view.
- *2026-05-27:* Created `PROJECT.md` (current state), `CONVENTIONS.md` (multi-tenant platform architecture), and updated `CLAUDE.md`. Platform renamed to LiftCollab internally. Module prefix convention established (`wl_` for waitlist). Future architectural steps documented.
- *2026-05-27:* Added `STRATEGY.md` (LIFT vision, Head/Heart/Hands, funder positioning, Wildwood origin story), `ARCHITECTURE.md` (multi-tenant DB schema, subdomain routing, code organization), and `ROADMAP.md` (5-phase implementation plan). CLAUDE.md updated to reflect Phase 1 as active work. CONVENTIONS.md reconciled against ARCHITECTURE.md.

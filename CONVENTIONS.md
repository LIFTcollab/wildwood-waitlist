# CONVENTIONS.md — LiftCollab Platform Architecture

This document defines the conventions for the **LiftCollab multi-tenant, multi-module platform**.
Wildwood is the first tenant, and the waitlist is the first module.
All future modules and tenants must follow these patterns.

---

## Platform Model

```
Platform: LiftCollab
  └── Tenant: Wildwood (wildwood.liftcollab.app)
        └── Module: Waitlist (wl_)
  └── Tenant: [Next org] ([slug].liftcollab.app)
        └── Module: [whatever they need]
```

- **Organizations are tenants.** One `organizations` row per nonprofit/school/sponsor.
- **Subdomains identify the organization.** `wildwood.liftcollab.app` → Wildwood org.
- **Modules are features.** A module is a coherent slice of functionality (waitlist management, program management, volunteer management, etc.).
- **Each module has a table prefix.** This keeps the DB schema readable and allows modules to be enabled/disabled per org.

---

## Core Tables (Shared — Never Module-Prefixed)

These four tables are the backbone of the platform. They must exist in every deployment.

```sql
organizations          -- one row per tenant
users                  -- platform-level user accounts (maps to auth.users)
modules                -- registry of available modules (wl, pm, vm, …)
organization_modules   -- which modules are enabled for which org
```

> **Current state:** `organizations` and `user_profiles` already exist.
> `modules` and `organization_modules` are not yet created.
> `user_profiles` will evolve into `users` as the platform grows.

### `organizations`
```sql
id              uuid PK
name            text NOT NULL
slug            text UNIQUE NOT NULL  -- subdomain routing: "wildwood" → wildwood.liftcollab.app
domain          text                  -- optional custom domain
type            org_type_enum         -- nonprofit | business_sponsor | foundation |
                                      --   community_org | government | lift_internal
status          org_status_enum       -- Active | Inactive
created_at      timestamptz
updated_at      timestamptz
```

> **Current state:** `organizations` has `id`, `legacy_id`, `name`, `status`, `created_at`.
> Missing: `slug`, `type`, `domain`, `updated_at`. These are added in Phase 1.4.
> `org_status_enum` already exists ('Active' | 'Inactive' — note capitalized values).
> `org_type_enum` does not exist yet; create it in the Phase 1.4 migration.

### `users` (evolves from `user_profiles`)
```sql
id              uuid PK REFERENCES auth.users(id)
name            text
role            user_role_enum        -- Admin | Director | Viewer (per-org role)
organization_id uuid REFERENCES organizations(id)
created_at      timestamptz
```

### `modules`
```sql
id          uuid PK
slug        text UNIQUE NOT NULL   -- e.g. "wl", "pm", "vm"
name        text NOT NULL          -- e.g. "Waitlist", "Program Management", "Volunteers"
description text
created_at  timestamptz
```

### `organization_modules`
```sql
id              uuid PK
organization_id uuid REFERENCES organizations(id)
module_id       uuid REFERENCES modules(id)
enabled         boolean DEFAULT true
config          jsonb                 -- module-specific config for this org
created_at      timestamptz
```

---

## Module Naming Convention

Every module gets a **2–3 letter lowercase prefix** followed by an underscore.

| Prefix | Module |
|--------|--------|
| `wl_`  | Waitlist (children, terms, families, enrollment) |
| `pm_`  | Program Management (LIFT partnerships, partners, outcomes, budgets) |
| `vm_`  | Volunteers |
| `fn_`  | Fundraising |
| `ev_`  | Events |

### Rules

1. **All module-specific DB tables are prefixed.** `wl_waitlist_items`, `pm_programs`, etc.
2. **Core tables are never prefixed.** `organizations`, `user_profiles`, `modules`, `organization_modules`.
3. **Views, functions, and triggers follow the same prefix.** `wl_items_view`, `fn_update_wl_item()`.
4. **App Router routes mirror the module slug.** `/wl/waitlist`, `/pm/programs`, etc. (or module-specific slugs).
5. **App code is grouped by module in `/modules/<slug>/`.** Types, components, and lib are co-located per module.

> **Current state:** The existing tables (`families`, `children`, `parents`, `school_terms`, `waitlist_items`, `tasks`) are un-prefixed (built before this convention). Phase 1.3 renames them to `wl_` as a coordinated migration (all queries, views, triggers, and actions updated together).

---

## Tenant Isolation Model

Every module table **must** have an `organization_id` column that references `organizations(id)`.
RLS enforces isolation automatically via the shared helper functions.

### The Two RLS Helper Functions

```sql
current_user_org()   → uuid    -- returns the calling user's organization_id
current_user_role()  → enum    -- returns the calling user's role
```

These are `SECURITY DEFINER` with explicit `SET search_path = ''`. They are the only allowed
way to reference the current user's org in RLS policies. Never hardcode org IDs.

### Standard RLS Policy Pattern

Every module table gets exactly **four policies** (one per operation — no `FOR ALL`):

```sql
-- READ: all staff in the org
CREATE POLICY "<Module>: staff can view"
  ON public.<table> FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

-- WRITE: Admin and Director only
CREATE POLICY "<Module>: admins/directors can insert"
  ON public.<table> FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

CREATE POLICY "<Module>: admins/directors can update"
  ON public.<table> FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );

CREATE POLICY "<Module>: admins/directors can delete"
  ON public.<table> FOR DELETE TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );
```

**Why four policies?** Supabase Advisor lint 0006 — multiple permissive SELECT policies are evaluated per row. One SELECT + separate write policies is the correct pattern.

### New Table Checklist

This project uses **restrictive default privileges** (opted in 2026-05-12). New tables in `public` are not exposed to the Data API by default. Every new table migration must have all three steps:

```sql
-- 1. Create
CREATE TABLE public.<table> (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  -- ... columns
  created_at      timestamptz DEFAULT now()
);

-- 2. Grant (RLS gates row-level access; this just enables the Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;

-- 3. RLS policies (use the 4-policy pattern above)
```

---

## Subdomain Routing

Each tenant is accessed at `{slug}.liftcollab.app`. The slug maps to an `organizations` row.

### How It Works (Future Implementation)

1. Next.js middleware reads `request.headers.get("host")` → extract subdomain.
2. Look up `organizations` by `slug` → get `organization_id`.
3. Store the resolved org in a server-side cookie or header that Supabase picks up via RLS.
4. All subsequent queries are automatically scoped by the RLS `current_user_org()` helper.

> **Current state:** Wildwood is the only tenant and runs at its own Vercel deployment.
> There is no subdomain-to-org routing code yet. The `organizations` table has one row (Wildwood).
> Subdomain routing is the next major architectural step before onboarding a second tenant.

### Subdomain Convention

```
wildwood.liftcollab.app   → slug: "wildwood"
[org].liftcollab.app      → slug: "[org]"
app.liftcollab.app        → super-admin / platform dashboard (future)
```

---

## Code Organization

Module code is co-located under `/modules/<slug>/`. Shared platform code lives in `/lib/core/`.

```
/modules
  /waitlist                # wl_ module
    /components            # React components (WaitlistTable, ChildDetailPanel, etc.)
    /lib                   # Server Actions and module-specific utilities
    /types                 # TypeScript types for this module (wl.ts)

/lib
  /core                    # Shared platform services (no module prefix)
    /auth                  # Auth helpers
    /organizations         # Org lookup, slug resolution
    /users                 # User profile helpers
    /modules               # Module registry helpers
  /supabase                # createClient (browser and server)
  /utils                   # Generic utilities

/app
  /(platform)              # Authenticated platform routes (protected)
  /(public)                # Public routes (login)
  /api
    /modules
      /waitlist            # API routes for the waitlist module (if needed)
```

> **Current state (pre-Phase 1.2):** Code lives in `components/dashboard/`, `app/actions/`, and `lib/types/waitlist.ts`. Phase 1.2 moves these into the module structure above without changing functionality.

---

## Application Code Conventions

### Server vs Client Components

- **Default to Server Components.** Fetch all data server-side.
- `"use client"` only when you need: `useState`, `useEffect`, `usePathname`, browser APIs, or event handlers.
- **Never call Supabase from a client component** (except for real-time subscriptions, which we don't use yet).

### Data Flow

```
Page (Server Component)
  └── fetches data via createClient() from lib/supabase/server.ts
  └── passes data as props to Client Components
        └── Client Component calls Server Actions for mutations
              └── Server Action uses createClient() — never the browser client
                  └── calls revalidatePath() after mutations
```

### Server Actions

- All DB mutations go in `app/actions/<module>/` (or `app/actions/<action>.ts` for now).
- Always start with auth check: `supabase.auth.getUser()`.
- Always verify org: read from `user_profiles.organization_id`, not from the request.
- Role check before writes: reject if not Admin/Director.
- Return `{ error: string | null }` (plus data if needed).
- Call `revalidatePath()` for every route that shows the affected data.

### Supabase Client Usage

```typescript
// Server Components and Server Actions (app/actions/*.ts):
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Client Components (rare — only for hooks/browser):
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

### Views

- Use views for denormalized reads; use base tables for writes.
- All views must have `WITH (security_invoker = true)` — never SECURITY DEFINER views.
- Write through views via `INSTEAD OF UPDATE` triggers only when the view spans multiple tables.
  Otherwise write directly to the base table.

### File Naming

- React components: `PascalCase.tsx`
- Utilities and types: `camelCase.ts`
- Route segments: `lowercase/`
- Server Actions: `camelCase` function names in `camelCase.ts` files

### TypeScript Types

- Module-specific types live in `lib/types/<module>.ts` (e.g., `lib/types/wl.ts`).
- Types mirror DB view column names exactly (snake_case).
- Don't use `any` — use `unknown` and narrow, or proper interface types.

---

## Security Non-Negotiables

These apply to every module and every tenant. No exceptions.

1. **Never use the service_role key** in application code. It is not needed. Anon + RLS is the model.
2. **Always rely on RLS.** Never bypass it with raw SQL, `auth.admin.*`, or service clients.
3. **Every new table gets explicit `GRANT`** statements — the project uses restrictive default privileges.
4. **All SECURITY DEFINER functions** must have `SET search_path = ''` and fully-qualified table references.
5. **Views are SECURITY INVOKER** (`WITH (security_invoker = true)`) — never SECURITY DEFINER views.
6. **RLS policies: one SELECT + separate INSERT/UPDATE/DELETE** — never `FOR ALL` (causes duplicate evaluation).
7. **`current_user_org()` and `current_user_role()` are the only allowed ways** to reference the current user's org/role in RLS policies.
8. **Internal/trigger functions have `EXECUTE` revoked from `PUBLIC`** and re-granted only to `authenticated` where needed.
9. **`canEdit` must be checked in every component** that can mutate data. Viewer role is always read-only.

---

## Design System

The design system is shared across all modules and tenants (tenants can add their own brand color layer on top).

### Typography

```
font-serif  → Source Serif 4  — human moments: page titles, names, italic accents
font-sans   → Inter           — body, labels, buttons (the default for everything)
font-mono   → JetBrains Mono  — data: IDs, dates, codes, numbers, stat deltas
```

### Color Tokens (defined in `globals.css`)

```
--bg              #f7f5f0   warm cream page background
--surface         #ffffff   cards, table backgrounds
--surface-warm    #fbf9f4   sidebar, table headers, hover
--surface-hover   #f3efe6   deeper hover
--border          #e6e1d6   default border
--border-strong   #d4cdb9   emphasized border
--text            #2a2a26   primary text
--text-2          #6b6859   secondary text
--text-3          #9b9684   tertiary, metadata

--green           #4a7c59   primary action, enrolled, teacher priority
--green-deep      #2f5641   hover on green
--green-soft      #e3ede4   tinted background for green
--gold            #c19b3a   waitlisted, alumni priority
--gold-soft       #f4ebd0
--terra           #c87856   declined, board priority, urgent
--terra-soft      #f5e3da
--blue            #5a7a99   sibling priority
--blue-soft       #e2eaf2
--gray-soft       #ece9e0   regular priority, inactive
```

### Semantic Color Mapping

| Element | Token |
|---|---|
| Priority: Board | terra |
| Priority: Teacher | green |
| Priority: Alumni | gold |
| Priority: Sibling | blue |
| Priority: Regular | gray-soft |
| Status: Enrolled | green |
| Status: Waitlisted | gold |
| Status: Declined | terra |
| Status: Inactive | text-3 (muted) |
| Stat sparkline: waitlist | green |
| Stat sparkline: enrollment | gold |
| Stat sparkline: tasks | terra |
| Stat sparkline: families/people | blue |

### Visual Principles

- **Cream beats white.** Page background is `--bg` (`#f7f5f0`). White (`--surface`) is for elevated surfaces only.
- **Source Serif 4 is for names and headlines only.** Never for buttons, table headers, or data.
- **JetBrains Mono is for the machine.** IDs, dates, enum-like values, stat numbers.
- **Never hardcode hex colors.** Use CSS custom properties (`var(--green)`) or Tailwind tokens (`text-green`, `bg-terra-soft`).
- **Never use default Recharts colors.** Always map to the palette.
- **Tailwind only.** No CSS modules, styled-components, or inline styles except for dynamic values.

---

## Adding a New Module — Checklist

When adding the `pm_` (Programs) module or any other module:

### Database

- [ ] Prefix all new tables with the module key (`pm_sessions`, `pm_registrations`, etc.)
- [ ] Every table has `organization_id uuid NOT NULL REFERENCES organizations(id)`
- [ ] Every table has explicit `GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated`
- [ ] Every table has the 4-policy RLS pattern (SELECT + INSERT + UPDATE + DELETE)
- [ ] Add views for denormalized reads with `WITH (security_invoker = true)`
- [ ] Register the module: `INSERT INTO modules (slug, name) VALUES ('pm', 'Program Management')`
- [ ] Enable for org: `INSERT INTO organization_modules (organization_id, module_id) VALUES (..., <modules.id>)`
- [ ] Update `reference/wildwood_schema.sql` (or a new schema file for the module)

### App Code

- [ ] Types in `modules/pm/types/index.ts`
- [ ] Server Actions in `modules/pm/lib/actions/`
- [ ] Components in `modules/pm/components/`
- [ ] Pages in `app/(platform)/pm/` (or appropriate route group)
- [ ] Add nav item to `TopNav.tsx` (or a module-specific nav)
- [ ] Respect `canEdit` gating in every component

---

## What Does NOT Exist Yet

Sequenced per ROADMAP.md:

**Phase 1 (active):**
- `wl_` prefix on existing tables (Phase 1.3)
- `modules` and `organization_modules` tables (Phase 1.3)
- `slug`, `type`, `domain` columns on `organizations` (Phase 1.4)
- `org_type_enum` DB type (Phase 1.4)
- Module code structure in `/modules/waitlist/` (Phase 1.2)

**Phase 2:**
- Subdomain-to-org routing in middleware
- Domain migration to `wildwood.liftcollab.app`

**Phase 3+:**
- Program Management module (`pm_`) — all `pm_*` tables per ARCHITECTURE.md
- Second tenant (requires Phase 2 subdomain routing)
- Platform super-admin (`app.liftcollab.app`)

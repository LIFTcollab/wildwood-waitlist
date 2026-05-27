# PROJECT.md — Wildwood Waitlist

Current state snapshot as of 2026-05-27.
This is Wildwood's instance of the LiftCollab platform — the first tenant and the first module (`wl_` waitlist).

---

## What It Is

A staff-facing internal tool for **Wildwood**, a nature-based preschool.
Staff (Admin, Director, Viewer roles) manage a waitlist of children across multiple school terms,
track family details, and assign tasks.

- **Live app:** https://wildwood.liftcollab.org (also https://wildwood.vercel.app)
- **Repo:** `/Users/stevedamico/wildwood-waitlist/`
- **Supabase project ID:** `qxpftvnxorzwmawzhcjo`
- **Owner:** Steve D'Amico (steve@liftcollab.org) — not a developer; explains before doing

---

## Status: Feature-Complete, User Testing

All planned v1 features are shipped and security-hardened.
The app is in active use for user testing.

---

## Pages

| Route | Description |
|---|---|
| `/login` | Magic link login. Validates email via `check_email_exists` RPC (rate-limited), sends OTP via Resend. |
| `/dashboard` | Stat cards (waitlist, enrolled, tasks, families) + per-term status charts (TermChartGrid) + open tasks table. |
| `/waitlist` | Filterable/sortable table of all children. Click row → slide-in `ChildDetailPanel` with inline editing, task management, family link. Add child via 3-step modal (Family → Child → Entry). |
| `/families` | Family list. Click row → slide-in `FamilyDetailPanel` with parent editing (add/remove/edit). |
| `/settings` | School term management (TermsManager: add/edit name, status, dates). Data integrity check panel (Admin only). |

---

## Key Architectural Decisions

| Decision | Detail |
|---|---|
| Auth | Magic link only — no passwords |
| Security | Anon key + RLS only — **never service_role** |
| Mutations | Server Actions (`"use server"`) for all DB writes |
| Reads | Server Components + Supabase views (`waitlist_items_view`, `waitlist_tasks_view`, `user_profiles_view`) |
| View writes | `INSTEAD OF UPDATE` triggers on views handle inline editing |
| Role gate | `canEdit` = Admin or Director; Viewer is read-only throughout |
| Org isolation | Every table has `organization_id`; RLS enforces it via `current_user_org()` |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), deployed on Vercel |
| Language | TypeScript |
| Auth | `@supabase/ssr` — magic link only |
| Database | Supabase (Postgres 17 + RLS) |
| Styling | Tailwind CSS v4 (CSS-variable theme in `globals.css`) |
| Charts | Recharts |
| Email | Resend via Supabase custom SMTP |
| Hosting | Vercel (auto-deploy on push to `main`) |

---

## File Map

```
wildwood-waitlist/
├── app/
│   ├── (app)/                    # Protected routes — layout does auth check
│   │   ├── layout.tsx            # Auth guard, TopNav, user card
│   │   ├── dashboard/page.tsx    # Stat cards + term charts + open tasks
│   │   ├── waitlist/page.tsx     # WaitlistTable (server data fetch)
│   │   ├── families/page.tsx     # FamiliesTable (server data fetch)
│   │   └── settings/page.tsx     # TermsManager + DataIntegrityPanel
│   ├── (public)/
│   │   └── login/                # LoginForm.tsx — magic link flow
│   ├── actions/                  # Server Actions (all DB mutations)
│   │   ├── waitlist.ts           # updateWaitlistItem, createTask
│   │   ├── children.ts           # createWaitlistEntry (3-step: family→child→item)
│   │   ├── families.ts           # updateFamilyName, updateParent, addParent, deleteParent, moveParent/Child
│   │   ├── tasks.ts              # updateTask
│   │   ├── terms.ts              # createTerm, updateTerm
│   │   └── integrity.ts          # checkDataIntegrity (reads data_integrity_issues view)
│   ├── auth/callback/route.ts    # Magic link exchange → session → /dashboard
│   ├── layout.tsx                # Root layout — fonts (Source Serif 4, Inter, JetBrains Mono)
│   └── globals.css               # CSS custom properties + Tailwind v4 @theme
├── components/dashboard/
│   ├── WaitlistTable.tsx         # Filterable/sortable table + status bar chart
│   ├── ChildDetailPanel.tsx      # Slide-in panel: view + inline edit + tasks
│   ├── AddChildModal.tsx         # 3-step modal: Family → Child → Waitlist entry
│   ├── FamiliesTable.tsx         # Family list table
│   ├── FamilyDetailPanel.tsx     # Slide-in panel: family name + parents
│   ├── TermChartGrid.tsx         # Per-term status charts on dashboard
│   ├── OpenTasksTable.tsx        # Open tasks list on dashboard
│   ├── TermsManager.tsx          # Term CRUD (add/edit) in Settings
│   ├── DataIntegrityPanel.tsx    # Data integrity check (Admin only)
│   ├── TopNav.tsx                # Top nav bar (client — usePathname for active state)
│   ├── Charts.tsx / DashboardCharts.tsx  # Recharts wrappers
│   └── SignOutButton.tsx         # Sign out (client component)
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # createBrowserClient (use client components)
│   │   └── server.ts             # createServerClient (use server components + actions)
│   └── types/
│       └── waitlist.ts           # WaitlistItem, SchoolTerm TypeScript types
├── middleware.ts                 # Session refresh on every request
├── reference/
│   ├── wildwood_schema.sql       # Authoritative DB schema with full change log
│   └── wildwood-hybrid.html      # Design reference (open in browser)
└── CLAUDE.md                     # Claude Code session context
```

---

## Database

### Tables (9)

| Table | Purpose |
|---|---|
| `organizations` | Tenants — Wildwood is one row |
| `families` | Parent/child family units |
| `children` | Individual children with DOB, priority |
| `parents` | Parent contacts, linked to families |
| `school_terms` | Enrollment periods (Fall 25-26, etc.) |
| `waitlist_items` | One row per child-per-term waitlist entry |
| `tasks` | Staff action items linked to waitlist_items |
| `user_profiles` | Staff accounts with role + org (mirrors auth.users) |
| `rate_limit_log` | Internal — tracks pre-login email check attempts |

### Views (3)

| View | Purpose |
|---|---|
| `waitlist_items_view` | Joined children + terms for the waitlist UI |
| `waitlist_tasks_view` | Joined tasks + children + families + terms; `task_name` computed live |
| `user_profiles_view` | Joined user_profiles + get_auth_users() + organizations |

All views: `WITH (security_invoker = true)`.

### Key Functions

- `current_user_org()` — returns caller's `organization_id` (used in every RLS policy)
- `current_user_role()` — returns caller's role enum (used in write policies)
- `check_email_exists(text)` — rate-limited pre-login check (anon-callable)
- `get_auth_users()` — self-filtering access to `auth.users` (Admin/Director only see full org)
- `handle_new_user()` — trigger on `auth.users INSERT` → creates `user_profiles` row with NULL role/org
- `update_waitlist_items_view()` — `INSTEAD OF UPDATE` trigger for the waitlist view

### Security State (as of 2026-05-26)

- **17 Supabase Advisor warnings → 6 (all remaining are intentional)**
- RLS enabled on all tables, all with per-operation policies (SELECT / INSERT / UPDATE / DELETE split)
- Default privileges: restrictive (opted in early — new tables need explicit `GRANT`)
- `EXECUTE` on internal functions revoked from `PUBLIC`; re-granted only what app needs
- Remaining 6 warnings: `check_email_exists` anon (login flow), `current_user_org/role/get_auth_users` (RLS deps), no password protection (magic links only), `rate_limit_log` no-policy (intentional)

---

## Enums

```sql
waitlist_status_enum:  Enrolled, Waitlisted, Declined, Inactive
classroom_enum:        Younger Dome, Older Dome
priority_status_enum:  Board, Teacher, Alumni, Sibling, Regular
user_role_enum:        Admin, Director, Viewer
task_status_enum:      To Do, Doing, Done
task_priority_enum:    Urgent, Important, Can Wait
term_status_enum:      Open, Closed
org_status_enum:       Active, Inactive
```

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://qxpftvnxorzwmawzhcjo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase Dashboard → Settings → API>
```

In Vercel: same vars, **do NOT mark as Sensitive** (they are baked in at build time).

---

## Known Issues / Gotchas

- **`child_notes` column:** `waitlist_items_view` exposes `children.notes` as `child_notes`. The `update_waitlist_items_view()` trigger handles writing it back. TypeScript type includes it; the server action passes it through.
- **`data_integrity_issues` view:** referenced in `integrity.ts` but not in `wildwood_schema.sql`. This view must exist in the DB; if missing, the Settings page data integrity panel will error.
- **Magic link redirect URL** must match exactly — both `localhost:3000/auth/callback` and the production URL must be in Supabase → Authentication → URL Configuration → Redirect URLs.
- **RLS errors look like empty results** — Supabase doesn't surface permission errors; it silently hides rows.
- **`42501` PostgREST errors** = missing GRANT (not an RLS issue).
- **`NEXT_PUBLIC_` env vars** must NOT be Sensitive in Vercel.
- **`school_term_name_enum`** was dropped from `waitlist_items_view` (2026-05-26). `term_name` is now plain text — no `ALTER TYPE` needed for new terms.

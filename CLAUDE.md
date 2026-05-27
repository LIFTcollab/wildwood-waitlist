# Wildwood Waitlist

A web app for Wildwood, an Environmental preschool, to manage their waitlist of children. Staff (Admin, Director, Viewer roles) review applicants, manage families, and track tasks across multiple academic terms.

---

## How to Work With Me

I'm Steve, the project owner. I am comfortable editing config and small code snippets but I am **not a developer**. Treat me as someone learning the codebase, not a senior engineer.

- **Explain before doing**, especially the first time you use a new pattern (Server Components, middleware, route handlers). One or two sentences is enough.
- **Run commands yourself** when you can. Tell me what you ran and why.
- **When you need me to act** (paste an env var, click a magic link, create a Vercel project), pause and be explicit: "I need you to do X. Tell me when done."
- **Commit often** with clear messages after each working change. I want a clean undo history.
- **Be honest about uncertainty.** If you're not sure something will work, say so before writing 200 lines.
- **If I push back, reconsider** — I may have context you don't.
- **Update this file** when we establish new conventions or make architectural decisions. The Project Log section at the bottom is for chronological notes.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components fit our data-heavy use case |
| Language | TypeScript | Catches errors at write-time |
| Auth | `@supabase/ssr` | Current recommended Supabase pattern (NOT the deprecated `auth-helpers-nextjs`) |
| Database | Supabase (Postgres + Auth + RLS) | Already provisioned and hardened |
| Styling | Tailwind CSS | No heavy UI libraries |
| Charts | Recharts | Good React integration, customizable colors |
| Email | Resend (via Supabase custom SMTP) | Already configured |
| Hosting | Vercel | Best Next.js compatibility |

---

## Project Structure

```
wildwood-waitlist/
├── app/                      # Next.js App Router pages and routes
│   ├── (public)/             # Routes not requiring auth
│   │   └── login/
│   ├── dashboard/            # Protected staff routes
│   │   └── layout.tsx        # Auth check happens here
│   ├── auth/
│   │   └── callback/         # Magic link landing
│   ├── layout.tsx            # Root layout, fonts, global styles
│   └── globals.css
├── components/               # Reusable React components
│   ├── ui/                   # Generic primitives (Button, Input)
│   └── dashboard/            # Dashboard-specific (StatCard, charts)
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser Supabase client
│   │   ├── server.ts         # Server Supabase client (uses cookies)
│   │   └── middleware.ts     # Session refresh helper
│   └── types/                # Shared TypeScript types
├── reference/                # Design mockups, schema SQL — context only
├── middleware.ts             # Next.js middleware for session refresh
├── tailwind.config.ts        # Color palette + fonts
└── CLAUDE.md                 # This file
```

---

## Conventions

### File naming
- React components: `PascalCase.tsx` (`StatCard.tsx`)
- Utilities and helpers: `camelCase.ts` (`formatDate.ts`)
- Route segments: lowercase (`dashboard/`, `login/`)

### Server vs Client Components
- **Default to Server Components.** Only use `"use client"` when we need interactivity, hooks, or browser APIs.
- Data fetching happens in Server Components — never call Supabase from the client unless we specifically need a real-time subscription.

### Supabase calls
- Server-side: use `createServerClient` from `lib/supabase/server.ts`
- Client-side (rare): use `createBrowserClient` from `lib/supabase/client.ts`
- Always rely on RLS — never bypass with service_role
- Use views (`waitlist_items_view`, etc.) for joined reads; use base tables for writes

### ⚠️ Creating new tables (CRITICAL)
This project has opted in to Supabase's new restrictive default-privileges behavior. **New tables in the `public` schema are NOT exposed to the Data API by default.** If you create a table without explicit `GRANT` statements, the frontend will get permission-denied errors when querying it.

When creating any new table in this project, follow this three-step pattern in the same migration:

```sql
-- 1. Create the table
CREATE TABLE public.your_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  -- ... other columns
  created_at timestamptz DEFAULT now()
);

-- 2. Grant Data API access (RLS still gates row-level visibility)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
-- Add anon only if the table is intentionally public (rare — only the
-- parent-facing application form's target table would need this).

-- 3. RLS auto-enable trigger handles ENABLE ROW LEVEL SECURITY automatically,
--    but you still need policies:
CREATE POLICY "Any staff can view ..." ON public.your_table FOR SELECT TO authenticated
  USING (organization_id = public.current_user_org());

CREATE POLICY "Admins and Directors can manage ..." ON public.your_table FOR ALL TO authenticated
  USING (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  )
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['Admin'::user_role_enum, 'Director'::user_role_enum])
    AND organization_id = public.current_user_org()
  );
```

If you ever see a PostgREST error like:
```
{"code": "42501", "message": "permission denied for table X",
 "hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.X TO anon;"}
```
…it means you forgot step 2. Add the grant.

### Styling
- Tailwind only. No CSS modules, no styled-components.
- Use the custom CSS variables defined in `tailwind.config.ts` — never hardcode hex colors
- Hybrid editorial-operational aesthetic (see Design section below)

### Error handling
- Server Components: try/catch around Supabase calls, render an error state in JSX
- Forms: inline error messages below the relevant field
- Auth failures: redirect with `?error=...` query param, show toast or banner on landing page

---

## Supabase Project

| Setting | Value |
|---|---|
| Project ID | `qxpftvnxorzwmawzhcjo` |
| URL | `https://qxpftvnxorzwmawzhcjo.supabase.co` |
| Auth | Magic link only (no passwords) |
| Email provider | Resend (custom SMTP) |
| Test user | `steve@liftcollab.org` (Admin) |
| Default privileges | Restrictive (opted in to new Supabase default — see Conventions) |

**The anon key is in `.env.local` (not committed). Get it from Supabase Dashboard → Settings → API.**

**CRITICAL: Never reference the service_role key in any client-side or server-side application code. It is not needed. Anon key + RLS is the security model.**

### Database overview

9 tables and 3 views, all with Row Level Security enabled. RLS policies enforce org scoping and role checks automatically via the helper functions `current_user_org()` and `current_user_role()`.

**Tables:** `organizations`, `families`, `children`, `parents`, `school_terms`, `waitlist_items`, `tasks`, `user_profiles`, `rate_limit_log` (internal)

**Views:** `waitlist_items_view`, `waitlist_tasks_view`, `user_profiles_view`

**Enums:**
- `waitlist_status_enum`: Enrolled, Waitlisted, Declined, Inactive
- `classroom_enum`: Younger Dome, Older Dome
- `priority_status_enum`: Board, Teacher, Alumni, Sibling, Regular
- `user_role_enum`: Admin, Director, Viewer
- `task_status_enum`: To Do, Doing, Done
- `task_priority_enum`: Urgent, Important, Can Wait

Full schema in `reference/wildwood_schema.sql`.

### Anon-accessible RPCs
- `check_email_exists(text)` — used pre-login to validate user exists and rate-limit attempts

Everything else requires an authenticated JWT.

---

## Design Direction

**Hybrid editorial-operational aesthetic** — warm and considered like a small school, efficient and information-dense like a modern internal tool.

Combines three influences:
- **Warm palette and tone** — cream paper, forest green primary, ochre/terracotta/blue/sage as semantic colors
- **Efficient table layouts** — compact rows, mono fonts for IDs and dates, rounded filter pills
- **Visual metrics** — sparklines in stat cards, delta indicators, live update signals

Full visual reference at `reference/wildwood-hybrid.html`. Open it whenever you need to recall the look — it shows the dashboard with all the key components in their final form.

### Typography (3 fonts, all from Google Fonts)
- **Source Serif 4** (`opsz,wght@8..60,400..600`) — page titles, child names, italic accents. Used sparingly for "human moments" — anywhere a person's name or a hero headline appears.
- **Inter** (`wght@400..700`) — body text, UI labels, button labels. Default sans for everything that isn't a headline or a number/code.
- **JetBrains Mono** (`wght@400..500`) — IDs, dates, classroom codes, stat deltas, anywhere data feels "computational." Provides visual texture and tabular alignment.

### Color tokens

These are the actual CSS variable values to put in `tailwind.config.ts`:

```css
/* Surfaces & text */
--bg:             #f7f5f0   /* warm cream background */
--surface:        #ffffff   /* cards, table backgrounds */
--surface-warm:   #fbf9f4   /* sidebar, table headers, hover states */
--surface-hover:  #f3efe6   /* deeper hover */
--border:         #e6e1d6   /* default border */
--border-strong:  #d4cdb9   /* emphasized border */
--text:           #2a2a26   /* primary text */
--text-2:         #6b6859   /* secondary text */
--text-3:         #9b9684   /* tertiary, metadata */

/* Primary accent — forest green */
--green:          #4a7c59   /* buttons, active states, primary actions */
--green-deep:     #2f5641   /* hover state for green */
--green-soft:     #e3ede4   /* tinted backgrounds for "Teacher" priority, enrolled status */

/* Secondary accents — semantic */
--gold:           #c19b3a   /* "Alumni" priority, "Waitlisted" status */
--gold-soft:      #f4ebd0   /* tinted background for gold pills */
--terra:          #c87856   /* "Board" priority, "Declined" status, urgent items */
--terra-soft:     #f5e3da   /* tinted background for terra pills */
--blue:           #5a7a99   /* "Sibling" priority */
--blue-soft:      #e2eaf2   /* tinted background for blue */
--gray-soft:      #ece9e0   /* "Regular" priority, inactive states */
```

### Semantic color mapping
| Element | Color |
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
| Term dot (sidebar) | Cycle: green → gold → terra → blue per term |
| Sparkline (waitlist growth) | green |
| Sparkline (enrollment fill) | gold |
| Sparkline (tasks, urgent) | terra |
| Sparkline (families) | blue |

### Visual principles
- **Source Serif 4 only for human moments.** Page titles, child names, italic accents. Never for buttons, table headers, or data values.
- **Inter for the work.** Body, labels, buttons. Most of the interface.
- **JetBrains Mono for the machine.** IDs (`001`, `002`), dates (`Jan 1, 2025`), enum-like values (`Younger Dome`), stat deltas (`↑ 4.3%`).
- **Generous whitespace, rounded corners** (6–10px for buttons/cards, 100px for pills).
- **Cream beats white.** The page background is `#f7f5f0`, not `#ffffff`. White is reserved for elevated surfaces (cards, tables).
- **Sparklines use B's palette, not electric green.** Calm, informative, not alarming. Soft tints for older bars, full color for the most recent.
- **Charts and dashboards use palette colors only.** Never default Recharts blue/purple.
- **Live indicators (pulse animation) are forest green**, not neon. Operational but warm.
- **Hover states are subtle** — usually a shift to `--surface-warm`, never aggressive color changes.

---

## Running the Project

### Local development
```bash
npm install        # first time only
npm run dev        # starts dev server at localhost:3000
```

### Environment variables (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://qxpftvnxorzwmawzhcjo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase dashboard>
```

For Vercel deploy, the same vars go in Vercel Project Settings → Environment Variables.

### Type checking
```bash
npm run build      # also catches type errors
```

### Deploying
- Push to GitHub
- Vercel auto-deploys on push to `main`
- After first deploy, add the Vercel URL to Supabase: Authentication → URL Configuration → Redirect URLs

---

## Known Gotchas

- **Magic link redirect URL must match exactly.** Both `localhost:3000/auth/callback` and the production Vercel URL must be in Supabase's allowed redirect list.
- **Supabase cookies need both browser and server clients to read them.** Don't try to share one client; use the right one for context.
- **RLS errors look like empty results.** If a query returns `[]` unexpectedly, check whether the user is authenticated and whether the policy allows the SELECT — Supabase doesn't return a permission error, it just hides rows.
- **Permission-denied errors mean missing GRANT.** If PostgREST returns code `42501` ("permission denied for table X"), the role doesn't have base-level access. Different from RLS — see the Conventions section.
- **The `anon` role can only call `check_email_exists`.** All other table/view access requires auth.
- **Enum types in views can be tricky** — `term_name` in `waitlist_items_view` is cast to `school_term_name_enum`. New terms must be added to the enum first.

---

## Live App

Deployed at **https://wildwood.vercel.app** (Vercel, auto-deploys on push to `main`).

**v1 features:**
- Magic link login (`/login`) — validates email via `check_email_exists` RPC, sends OTP via Resend
- Protected dashboard (`/dashboard`) — server-side auth check, redirects to `/login` if unauthenticated
- Sidebar with brand, nav, and term list (live from DB)
- Editorial hero headline with total waitlist count spelled out
- Four stat cards with decorative sparklines (waitlist, enrolled, tasks, families)
- Four Recharts charts: by status (donut), by term (bar), priority distribution (horizontal bar), by classroom (donut)
- Recent additions list (5 most recent waitlist items)
- Sign out button in user card

---

## Project Log

Append decisions and notes here chronologically. Most recent at bottom.

- *Pre-build:* Database schema designed and secured. RLS policies, anon-revocation, with-check constraints, rate-limit hardening, user_profiles_view restriction, search_path hardening on all SECURITY DEFINER functions, and pg_cron cleanup job all applied. Schema documented in `reference/wildwood_schema.sql`.
- *2026-05-12:* Opted in to Supabase's new restrictive default privileges (announced Apr 28, 2026). New tables in `public` schema now require explicit `GRANT` statements before the Data API can see them. Existing tables unaffected.
- *2026-05-12:* Design direction finalized as hybrid editorial-operational. Three prototypes evaluated (modern, warm, data); final design combines warm palette/tone (B), efficient table layouts (A), and visual metric components like sparklines (C). Reference: `reference/wildwood-hybrid.html`. Typography: Source Serif 4 + Inter + JetBrains Mono. Primary accent: forest green `#4a7c59`.
- *2026-05-24:* v1 shipped. Login + dashboard live at wildwood.vercel.app. All 9 BUILD_PLAN success criteria met. Key deploy notes: Next.js 16 uses `proxy.ts` as middleware locally but Vercel's edge infrastructure requires `middleware.ts` — renamed accordingly. `NEXT_PUBLIC_` env vars must NOT be marked Sensitive in Vercel (they are baked in at build time and Sensitive blocks that). Supabase CAPTCHA protection disabled (not implemented in v1 login form). BUILD_PLAN.md archived.
- *2026-05-24:* `/dashboard/children` shipped. Full filterable waitlist table: text search (name + notes), four filter dropdowns (Term, Status, Priority, Classroom), priority-ranked default sort (Board→Regular), 25-per-page pagination, slide-in detail panel on row click (name/DOB/age/priority/status/classroom/term/notes). Sidebar nav converted to `SidebarNav` client component using `usePathname()` for correct active-link state. Shared types in `lib/types/waitlist.ts`. Key files: `components/dashboard/WaitlistTable.tsx`, `components/dashboard/ChildDetailPanel.tsx`, `components/dashboard/SidebarNav.tsx`.
- *2026-05-24:* Children list enhanced with three features. (1) **Inline editing** in detail panel — Admin/Director users see an Edit button; editable fields are name, DOB, priority, status, classroom, term, date applied, notes. Writes via `INSTEAD OF UPDATE` trigger on `waitlist_items_view` (server action in `app/actions/waitlist.ts`); optimistic update keeps table row in sync without page reload. (2) **Column sorting** — click any column header (Child, Priority, Term, Status, Classroom, Applied) to sort asc/desc; Priority sorts by rank. (3) **Multi-select filter dropdowns** — each filter replaced with a custom checkbox dropdown; button label shows active state (e.g. "Statuses · 2"); multiple selections are OR-matched.

# Build Plan — Initial Wildwood Frontend

This document describes the steps for the first build session(s). When the success criteria below are met, this file can be archived or deleted, and `CLAUDE.md` updated to describe the live app.

---

## What We're Building

Two pages, end-to-end working:

1. **`/login`** — Magic link login (no password)
2. **`/dashboard`** — Protected staff dashboard with live Supabase data and charts

That's it for v1. No CRUD pages, no kanban, no parent-facing form yet — those are future phases.

---

## Build Steps

### Step 1: Scaffold the project
- Initialize Next.js 15 app with App Router + TypeScript + Tailwind
- Install dependencies: `@supabase/ssr`, `@supabase/supabase-js`, `recharts`
- Configure Tailwind with the custom palette and Google Fonts (Fraunces, Manrope, JetBrains Mono)
- Create `.env.local.example` (committed) and `.env.local` (gitignored)
- Verify: I run `npm run dev` and see the default Next.js page

### Step 2: Supabase clients + middleware
- `lib/supabase/client.ts` — browser client using `createBrowserClient`
- `lib/supabase/server.ts` — server client using `createServerClient` with cookie handling
- `middleware.ts` — refreshes the session on every request

### Step 3: Login page (`/login`)
Two visual states:

**Idle:**
- Fraunces display headline ("Sign in to Wildwood" or similar editorial framing)
- Single email input (underline-only, serif)
- "Send magic link" button (moss green)

**Sent confirmation:**
- Italic serif: "Check your email — we sent a link to [email]"
- Subtle link to "use a different email"

Behavior:
- Optional: validate via `check_email_exists` RPC first (rate-limited)
- Call `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '${origin}/auth/callback' } })`
- Show inline error if email not recognized
- Loading state on submit button

### Step 4: Auth callback (`/auth/callback/route.ts`)
Server route handler that:
- Exchanges code from URL for a session
- Redirects to `/dashboard` on success
- Redirects to `/login?error=...` on failure

This is a `route.ts`, not a page.

### Step 5: Protected layout (`app/dashboard/layout.tsx`)
- Server-side session check; redirect to `/login` if missing
- Shared sidebar matching the moss-green sidebar from `reference/wildwood-custom-mockup.html`
- Signed-in user card at bottom with sign-out button

### Step 6: Dashboard page (`/dashboard`)
Server component with four sections:

**1. Hero (editorial)**
- Eyebrow: "A view of the waitlist this morning"
- Headline: `Two hundred ninety-three *children* are waiting.` (italic on "children", real number)
- Italic serif aside summarizing urgent items

**2. Stats strip** — 4 columns, top + bottom borders, no card backgrounds
- Total on waitlist
- Enrolled this term
- Open tasks
- Active families

**3. Charts (Recharts, custom colors)**

| Chart | Type | Colors |
|---|---|---|
| Waitlist by Status | Donut | moss=Enrolled, ochre=Waitlisted, terracotta=Declined, sage=Inactive |
| Waitlist by Term | Vertical Bar | moss bars |
| Priority Distribution | Horizontal Bar | ochre bars, order: Board → Teacher → Alumni → Sibling → Regular |
| By Classroom | Donut | sage=Younger Dome, ochre=Older Dome |

**4. Recent activity**
- Top 5 most recently created waitlist items
- Format: italic serif list with child name + term + status

### Step 7: Sign out
- Button in sidebar user card
- Calls `supabase.auth.signOut()` → router.push('/login')

### Step 8: Deploy to Vercel
- `git add` + commit + push to GitHub (Steve creates the empty repo first)
- Walk Steve through Vercel project creation (auto-detects Next.js)
- Walk through adding env vars to Vercel
- After first deploy, Steve adds the Vercel URL to Supabase Authentication → URL Configuration → Redirect URLs
- End-to-end test against the deployed URL

---

## SQL Queries the Dashboard Needs

All run via the authenticated server client. RLS handles org scoping automatically.

```typescript
// Total waitlist count
const { count: totalWaitlist } = await supabase
  .from('waitlist_items')
  .select('*', { count: 'exact', head: true });

// By status — fetch rows, aggregate in JS
const { data: byStatus } = await supabase
  .from('waitlist_items')
  .select('status')
  .not('status', 'is', null);

// By term (view has the joined name)
const { data: byTerm } = await supabase
  .from('waitlist_items_view')
  .select('term_name');

// By priority
const { data: byPriority } = await supabase
  .from('waitlist_items_view')
  .select('priority_status');

// By classroom
const { data: byClassroom } = await supabase
  .from('waitlist_items')
  .select('classroom')
  .not('classroom', 'is', null);

// Recent activity
const { data: recent } = await supabase
  .from('waitlist_items_view')
  .select('id, child_full_name, term_name, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

// Open tasks count
const { count: openTasks } = await supabase
  .from('tasks')
  .select('*', { count: 'exact', head: true })
  .neq('status', 'Done');

// Active families count
const { count: activeFamilies } = await supabase
  .from('families')
  .select('*', { count: 'exact', head: true });
```

Use view names exactly as shown — they're case-sensitive.

---

## Edge Cases to Handle

1. **No data returned** — empty-state visual, not a crashed component
2. **Session expired** — middleware refreshes; if it can't, redirect to `/login`
3. **Email not in `user_profiles`** — magic link still sends, but dashboard RLS will block all queries. Show: "Your account isn't fully set up — contact your administrator."
4. **Loading states** — skeleton placeholders for charts during fetch, not blank space

---

## Success Criteria

Build is complete when Steve can:

1. Visit the deployed Vercel URL
2. Enter `steve@liftcollab.org` on the login page
3. Receive a magic link email from Resend
4. Click the link → land on the dashboard
5. See 293 total waitlist entries in the hero (real data)
6. See all four charts rendering with palette colors
7. See 5 most recent waitlist items in activity list
8. Sign out successfully
9. Confirm `/dashboard` redirects to `/login` after sign out

When all 9 are working: append a "v1 shipped" entry to the Project Log in `CLAUDE.md`, update the Build Plan section there to describe the live app, and archive this file.

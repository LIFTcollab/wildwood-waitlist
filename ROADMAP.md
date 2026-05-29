# LIFT Platform — Implementation Roadmap

This roadmap sequences the work of evolving the Wildwood waitlist app into the LIFT multi-tenant, multi-module platform.

## Current State

- Wildwood waitlist app live at `wildwood.liftcollab.app` (wildwood.liftcollab.org redirects here)
- Phases 1 and 2 complete — multi-tenant foundation + subdomain routing live
- All tables prefixed `wl_`; `modules` and `organization_modules` tables seeded
- App in active use; Phase 3 (program management) is next

## Phase 1 — Platform Foundation ✓ Complete

### Goal
Establish the multi-tenant, multi-module foundation without breaking existing waitlist functionality.

### Steps

**1.1 Document Current State**
- Create `PROJECT.md` documenting current folder structure, schema, auth approach, dependencies, deployment
- This becomes the baseline reference

**1.2 Refactor Code into Module Pattern**
- Create `/modules/waitlist` folder
- Move all waitlist-specific code into it
- Create `/lib/core` for shared services
- Verify nothing broke

**1.3 Migrate Database to Module Pattern**
- Add `wl_` prefix to existing waitlist tables
- Create `modules` and `organization_modules` core tables
- Seed with the waitlist module and Wildwood's enablement
- Update all queries and RLS policies

**1.4 Add Organization Type & Status Fields**
- Update `organizations` table with `type` and `status` columns
- Set Wildwood as `type: nonprofit`, `status: active`
- Update RLS policies as needed

**1.5 Verify Wildwood Still Works**
- Full test of waitlist functionality
- Confirm no regressions

## Phase 2 — Subdomain Routing & Domain Migration ✓ Complete

### Goal
Move from `wildwood.liftcollab.org` to `wildwood.liftcollab.app` with proper subdomain-based tenant routing.

### Steps

**2.1 Implement Subdomain Middleware**
- Next.js middleware reads subdomain
- Looks up organization by slug
- Sets organization context for the request
- Filters all data queries by that organization

**2.2 Add Domain in Vercel**
- Add `wildwood.liftcollab.app` to the Vercel project
- Verify Vercel CNAME target

**2.3 Configure Cloudflare DNS**
- Add CNAME for `wildwood.liftcollab.app` pointing to Vercel
- Set proxy to DNS-only (gray cloud)
- Wait for SSL provisioning

**2.4 Test Thoroughly**
- Verify `wildwood.liftcollab.app` loads Wildwood's data
- Verify auth works
- Verify subdomain context is correct

**2.5 Set Up Redirect**
- Configure `wildwood.liftcollab.org` to permanently redirect to `wildwood.liftcollab.app`

## Phase 3 — Program Management Module ← Active

### Goal
Build the program management module to support LIFT's collective impact partnerships.

### Steps

**3.1 Create Database Schema**
- All `pm_*` tables per ARCHITECTURE.md
- RLS policies for each table
- Seed the program management module in `modules` table

**3.2 Build Core Program Management UI**
- Program list and detail views (LIFT staff)
- Project list and detail views
- Partner management within programs
- Outcome tracking with revision history
- Simple budget tracking (allocation and spend)

**3.3 Build Partner Dashboard Views**
- Organizations can see programs they're partners in
- Read access to project status, milestones, outcomes
- Visibility filtered by their role in the program

**3.4 Build Sponsor Dashboard Views**
- Sponsors see program progress they're funding
- Outcome measurements and trend data
- Budget summary (high-level)

**3.5 Add Partner Communication Layer**
- `pm_program_updates` posting and feed
- Visibility controls (all_partners, sponsors_only, board_only, lift_only)

## Phase 4 — Multi-Tenant Onboarding

### Goal
Make it straightforward for LIFT to add new nonprofit partners to the platform.

### Steps

**4.1 LIFT Admin Tools**
- Internal admin interface for LIFT staff
- Create organization workflow
- Enable modules for an organization
- Provision initial admin user

**4.2 Self-Serve User Signup**
- Once an organization exists, additional staff can self-register
- Admin approval flow for new users joining an existing organization

**4.3 Onboarding Documentation**
- Internal runbook for LIFT staff onboarding new partners
- Welcome experience for new organization admins

## Phase 5 — First Multi-Sector Partnership Pilot

### Goal
Use the platform to orchestrate the first real multi-sector partnership, likely around Colorado child care.

### Steps

**5.1 Identify Pilot Program**
- Define the cause (likely child care access)
- Identify sponsor(s)
- Recruit 3-5 partner organizations
- Define initial outcomes

**5.2 Configure the Program on the Platform**
- Create program record
- Add all partners with appropriate roles
- Define outcomes
- Set budget allocations

**5.3 Run the Program**
- Use the platform to coordinate the actual work
- Generate dashboards for sponsors
- Iterate on platform based on real use

**5.4 Generate Funder-Ready Reporting**
- Outcome reports
- Partnership impact narratives
- Case study for future funder pitches

## Cross-Cutting Workstreams

### Documentation
Maintain throughout:
- `STRATEGY.md` — strategic context
- `ARCHITECTURE.md` — technical decisions
- `ROADMAP.md` — this file
- `CONVENTIONS.md` — coding conventions
- `CLAUDE.md` — context for Claude Code sessions
- `PROJECT.md` — current state of the codebase

### Quality Practices
- Small, reviewable increments
- Have Claude Code explain plans before implementing
- Test after each phase
- Commit working state before moving to the next step

### Architectural Discipline
- Every 6 months, review architecture against separation triggers in ARCHITECTURE.md
- Resist scope creep within modules
- Keep core tables minimal and clean

## Success Criteria by Phase

| Phase | Success Looks Like |
|---|---|
| Phase 1 | Wildwood works exactly as before, but on the new module foundation |
| Phase 2 | Wildwood lives at `wildwood.liftcollab.app` with proper subdomain routing |
| Phase 3 | LIFT can create and manage programs, partners, and outcomes |
| Phase 4 | A new nonprofit can be onboarded in under 30 minutes |
| Phase 5 | A real multi-sector partnership runs on the platform with sponsor visibility |

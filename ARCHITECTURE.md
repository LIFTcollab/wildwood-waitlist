# LIFT Platform — Technical Architecture

## Core Architectural Principles

### Multi-Tenant, Multi-Module
The platform serves multiple organizations (tenants) with multiple types of tools (modules). One database, one app, separated by:
- **Organization** — the tenant boundary
- **Module** — the functional boundary

### Unified Platform, Disciplined Separation
A single Supabase instance and single Vercel app, with strict module isolation in code so that splitting a module out later remains mechanically straightforward.

### Subdomain as Tenant Identifier
Each organization is identified by their subdomain slug:
- `wildwood.liftcollab.app` — Wildwood Preschool's branded view
- `[partner].liftcollab.app` — pattern for all future partners

## Technology Stack

- **Frontend & Hosting** — Next.js on Vercel
- **Database & Auth** — Supabase (PostgreSQL with Row-Level Security)
- **DNS & CDN** — Cloudflare (nameservers pointed from GoDaddy registrar)
- **Development** — Claude Code

### Cloudflare/Vercel Configuration Note
Turn off Cloudflare's proxy (gray cloud, DNS-only) for Vercel-hosted subdomains. Let Vercel handle SSL directly to avoid conflicts.

## Database Schema

### Core Tables (Shared Across All Modules)

```sql
organizations
  id, name, slug, domain, type, status
  created_at, updated_at
  -- type: nonprofit, business_sponsor, foundation,
  --       community_org, government, lift_internal
  -- status: active, inactive

users
  id, organization_id, role, email
  created_at, updated_at
  -- role: lift_admin, lift_staff, org_admin,
  --       org_staff, partner_viewer, sponsor_viewer

modules
  id, name, slug, description
  -- e.g., waitlist, program_management

organization_modules
  id, organization_id, module_id
  enabled, config, created_at
```

### Waitlist Module (`wl_` prefix)

Existing tables migrated from Wildwood with `wl_` prefix:
- `wl_children`
- `wl_parents`
- `wl_waitlist`
- (other existing waitlist tables)

All reference `organization_id` for tenant isolation.

### Program Management Module (`pm_` prefix)

```sql
pm_programs
  id, name, slug, description, status
  start_date, end_date, total_budget
  lift_lead_user_id, created_at
  -- status: planning, active, paused, completed

pm_program_partners
  id, program_id, organization_id
  role, status, allocated_budget
  joined_at, exited_at
  -- role: lead, contributor, advisor, sponsor,
  --       delivery_sponsor, fiscal_sponsor

pm_program_board_members
  id, program_id, user_id, role
  -- role: board_chair, board_member, observer

pm_projects
  id, program_id, name, description, status
  start_date, end_date
  lead_organization_id, lead_user_id
  -- status: planned, active, paused, completed

pm_project_partners
  id, project_id, organization_id, role
  -- role: lead, contributor, advisor

pm_project_milestones
  id, project_id, name, description
  target_date, completed_date, status

pm_project_tasks
  id, project_id, milestone_id, name, description
  assigned_user_id, assigned_organization_id
  due_date, completed_date, status

pm_outcomes
  id, program_id, name, description
  measurement_method, target_value
  status, defined_at, revised_at
  -- status: proposed, active, achieved, revised, retired

pm_outcome_measurements
  id, outcome_id, value, measured_at
  measured_by_user_id, notes

pm_outcome_revisions
  id, outcome_id, previous_definition,
  new_definition, reason, revised_at

pm_program_budgets
  id, program_id, total_amount
  funded_amount, spent_amount, currency

pm_partner_allocations
  id, program_id, organization_id
  allocated_amount, spent_amount
  notes, last_updated_by, last_updated_at

pm_program_updates
  id, program_id, author_user_id
  title, body, visibility, created_at
  -- visibility: all_partners, lift_only,
  --             sponsors_only, board_only
```

## Row-Level Security (RLS) Patterns

Every tenant-scoped table follows this pattern:

```sql
CREATE POLICY "organization_isolation" ON [table_name]
  USING (organization_id = (
    SELECT organization_id
    FROM users
    WHERE id = auth.uid()
  ));
```

LIFT staff have elevated access via role-based policies:

```sql
CREATE POLICY "lift_staff_access" ON [table_name]
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('lift_admin', 'lift_staff')
  ));
```

## Subdomain Routing

Next.js middleware reads the subdomain from incoming requests:

1. Extract subdomain from request hostname
2. Look up `organizations.slug` matching the subdomain
3. Set organization context for the request
4. All subsequent queries filter by that organization

LIFT staff at `app.liftcollab.app` or root domain see cross-organization views.

## Code Organization

```
/app
  /(platform)              # Authenticated platform routes
  /(public)                # Marketing pages
  /api
    /modules
      /waitlist
      /programs

/modules
  /waitlist                # Waitlist module
    /components
    /lib
    /types
  /programs                # Program management module
    /components
    /lib
    /types

/lib
  /core                    # Shared core
    /auth
    /organizations
    /users
    /modules
  /supabase
  /utils

/middleware.ts             # Subdomain routing
```

### Module Isolation Rules

1. Modules never directly query each other's tables
2. Cross-module needs go through `/lib/core` services
3. Each module owns its prefixed tables exclusively
4. Shared tables (`organizations`, `users`) accessed only via core services

## Partnership Model in Schema

The program management module reflects LIFT's collective impact model:

- **Sponsors are partners** — represented as `organizations` with `type: business_sponsor` or `foundation`, given a role in `pm_program_partners`
- **Community drives deliverables** — outcomes defined at program level, partners contribute based on expertise
- **LIFT is the backbone** — `lift_lead_user_id` on every program and project
- **Adaptive outcomes** — `pm_outcome_revisions` preserves learning as outcomes evolve
- **Simple budget tracking** — allocation and spend only, no invoicing complexity
- **Transparent dashboards** — all partners see program progress; sponsors get visibility, not control

## Triggers for Future Architectural Separation

Watch for these signals to consider splitting a module to its own database:

| Trigger | Meaning |
|---|---|
| One module's data exceeds 10x another's | Performance separation needed |
| A module requires compliance the others don't (HIPAA, SOC2) | Compliance separation needed |
| A module becomes a standalone product | Business separation needed |
| A nonprofit wants to take their data and self-host | Customer-driven separation |
| Different security models required | Security separation needed |

Revisit architecture every 6 months against this list.

## Multi-Tenant Onboarding Flow

Adding a new nonprofit partner:
1. New row in `organizations` with their slug
2. New rows in `organization_modules` for tools they need
3. New DNS record in Cloudflare for `[slug].liftcollab.app`
4. New domain in Vercel pointing to the same app
5. Create initial admin user for the organization

Initial onboarding is LIFT-led. Once an organization is created, their staff can self-serve sign up.

// Core organization helpers — shared across all modules.
// Stub for Phase 1; subdomain-to-org resolution added in Phase 2.
export type Organization = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
};

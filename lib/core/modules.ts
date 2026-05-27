// Core module registry helpers — shared across all modules.
// Stub for Phase 1; modules and organization_modules tables added in Phase 1.3.
export type Module = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

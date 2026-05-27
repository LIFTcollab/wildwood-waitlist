// Core user helpers — shared across all modules.
// user_profiles is the current table; will align with `users` naming in a future migration.
export type UserProfile = {
  id: string;
  name: string | null;
  role: string | null;
  organization_id: string | null;
};

// Shared types for the waitlist feature.
// WaitlistItem mirrors the columns we SELECT from waitlist_items_view.

export type WaitlistItem = {
  id: string;
  child_id: string;
  child_full_name: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  priority_status: string | null;
  priority_rank: number | null;
  term_name: string | null;
  term_id: string;
  status: string | null;
  classroom: string | null;
  date_applied: string | null;
  notes: string | null;
  created_at: string;
};

export type SchoolTerm = {
  id: string;
  name: string;
  sort_order: number | null;
};

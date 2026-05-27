"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { WaitlistItem } from "@/lib/types/waitlist";

export type CreateWaitlistEntryInput = {
  // Family — provide familyId for existing, familyName for new
  familyId:    string | null;
  familyName:  string | null;

  // Child
  firstName:   string;
  lastName:    string;
  dob:         string | null; // YYYY-MM-DD

  // Waitlist entry
  termId:      string;
  status:      string;        // default "Waitlisted"
  classroom:   string | null;
  dateApplied: string | null; // YYYY-MM  (stored as YYYY-MM-01)
  notes:       string | null;
};

export async function createWaitlistEntry(
  input: CreateWaitlistEntryInput
): Promise<{ error: string | null; item: WaitlistItem | null }> {
  const supabase = await createClient();

  // Resolve organization from the calling user's profile
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", item: null };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id)
    return { error: "No organization found for your account", item: null };

  const orgId = profile.organization_id as string;

  // ── 1. Resolve or create family ───────────────────────────────────────────
  let familyId = input.familyId;
  if (!familyId) {
    const { data: fam, error: famErr } = await supabase
      .from("families")
      .insert({ name: input.familyName!.trim(), organization_id: orgId })
      .select("id")
      .single();
    if (famErr || !fam)
      return { error: famErr?.message ?? "Failed to create family", item: null };
    familyId = fam.id as string;
  }

  // ── 2. Create child ───────────────────────────────────────────────────────
  const { data: child, error: childErr } = await supabase
    .from("children")
    .insert({
      first_name:      input.firstName.trim(),
      last_name:       input.lastName.trim(),
      dob:             input.dob || null,
      family_id:       familyId,
      organization_id: orgId,
    })
    .select("id")
    .single();

  if (childErr || !child)
    return { error: childErr?.message ?? "Failed to create child", item: null };

  // ── 3. Create waitlist item ───────────────────────────────────────────────
  const { data: wi, error: wiErr } = await supabase
    .from("waitlist_items")
    .insert({
      child_id:        child.id,
      term_id:         input.termId,
      organization_id: orgId,
      status:          input.status || "Waitlisted",
      classroom:       input.classroom || null,
      date_applied:    input.dateApplied ? `${input.dateApplied}-01` : null,
      notes:           input.notes || null,
    })
    .select("id")
    .single();

  if (wiErr || !wi)
    return { error: wiErr?.message ?? "Failed to create waitlist entry", item: null };

  // ── 4. Fetch the full view row so the table can show it immediately ───────
  const { data: viewRow, error: viewErr } = await supabase
    .from("waitlist_items_view")
    .select(
      "id, child_id, child_full_name, first_name, last_name, dob, " +
      "priority_status, priority_rank, term_name, term_id, status, child_notes, " +
      "classroom, date_applied, notes, created_at"
    )
    .eq("id", wi.id)
    .single();

  revalidatePath("/waitlist");

  // If the view fetch fails after all 3 inserts succeeded, return a minimal
  // item rather than an error — this prevents the caller from retrying and
  // creating duplicate family/child/waitlist_item rows.
  if (viewErr || !viewRow) {
    const fallback: WaitlistItem = {
      id:              wi.id as string,
      child_id:        child.id as string,
      child_full_name: `${input.firstName.trim()} ${input.lastName.trim()}`,
      first_name:      input.firstName.trim(),
      last_name:       input.lastName.trim(),
      dob:             input.dob ?? null,
      priority_status: null,
      priority_rank:   null,
      term_name:       null,
      term_id:         input.termId,
      status:          input.status ?? "Waitlisted",
      classroom:       input.classroom ?? null,
      date_applied:    input.dateApplied ? `${input.dateApplied}-01` : null,
      notes:       input.notes ?? null,
      child_notes: null,
      created_at:  new Date().toISOString(),
    };
    return { error: null, item: fallback };
  }

  return { error: null, item: viewRow as unknown as WaitlistItem };
}

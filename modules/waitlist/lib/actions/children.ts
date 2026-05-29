"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { WaitlistItem } from "@/modules/waitlist/types";

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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", item: null };

  // The family (resolve or create) → child → waitlist item are created
  // atomically inside the wl_create_waitlist_entry RPC. It is SECURITY INVOKER,
  // so base-table RLS and the Admin/Director role check still apply, and any
  // mid-way failure rolls the whole thing back — no orphaned family/child rows.
  // The RPC also verifies a supplied family belongs to the caller's org.
  const { data: created, error: rpcErr } = await supabase.rpc(
    "wl_create_waitlist_entry",
    {
      p_family_id:    input.familyId,
      p_family_name:  input.familyName?.trim() ?? null,
      p_first_name:   input.firstName.trim(),
      p_last_name:    input.lastName.trim(),
      p_dob:          input.dob || null,
      p_term_id:      input.termId,
      p_status:       input.status || "Waitlisted",
      p_classroom:    input.classroom || null,
      p_date_applied: input.dateApplied ? `${input.dateApplied}-01` : null,
      p_notes:        input.notes || null,
    }
  );

  if (rpcErr) return { error: rpcErr.message, item: null };

  const ids = created as { item_id: string; child_id: string } | null;
  if (!ids?.item_id)
    return { error: "Failed to create waitlist entry", item: null };

  // Fetch the full view row so the table can show it immediately.
  const { data: viewRow, error: viewErr } = await supabase
    .from("waitlist_items_view")
    .select(
      "id, child_id, child_full_name, first_name, last_name, dob, " +
      "priority_status, priority_rank, term_name, term_id, status, child_notes, " +
      "classroom, date_applied, notes, created_at"
    )
    .eq("id", ids.item_id)
    .single();

  revalidatePath("/waitlist");
  revalidatePath("/dashboard");

  // If the view fetch fails after the entry was created, return a minimal item
  // rather than an error — this prevents the caller from retrying and creating
  // a duplicate entry.
  if (viewErr || !viewRow) {
    const fallback: WaitlistItem = {
      id:              ids.item_id,
      child_id:        ids.child_id,
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

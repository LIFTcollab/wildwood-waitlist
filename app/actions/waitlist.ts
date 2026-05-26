"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type WaitlistItemUpdate = {
  first_name: string;
  last_name: string;
  dob: string | null;
  priority_status: string | null;
  status: string | null;
  classroom: string | null;
  term_id: string;
  date_applied: string | null;
  notes: string | null;
};

export async function updateWaitlistItem(
  id: string,
  data: WaitlistItemUpdate
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("waitlist_items_view")
    .update(data)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/waitlist");
  return { error: null };
}

export async function createTask(
  waitlistItemId: string,
  description: string
): Promise<{ error: string | null; taskId: string | null; taskName: string | null }> {
  const supabase = await createClient();

  // Fetch context from the view — gives us organization_id, child name, and
  // term name in one query so we can auto-build the task name.
  const { data: wi, error: wiError } = await supabase
    .from("waitlist_items_view")
    .select("organization_id, child_full_name, term_name")
    .eq("id", waitlistItemId)
    .single();

  if (wiError || !wi) return { error: "Waitlist item not found", taskId: null, taskName: null };

  // Auto-generated name: "Child Name: Term" — useful in cross-child views
  // like the Dashboard tasks table where context isn't otherwise visible.
  const name = `${wi.child_full_name}: ${wi.term_name ?? ""}`.trim();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      waitlist_item_id: waitlistItemId,
      organization_id:  wi.organization_id,
      name,
      description,
      status:   "To Do",
      priority: "Important",
    })
    .select("id")
    .single();

  if (error) return { error: error.message, taskId: null, taskName: null };
  revalidatePath("/waitlist");
  return { error: null, taskId: data.id, taskName: name };
}

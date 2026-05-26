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
  name: string
): Promise<{ error: string | null; taskId: string | null }> {
  const supabase = await createClient();

  // Fetch organization_id from the waitlist item (RLS ensures caller can only
  // see items in their own org, so this is safe).
  const { data: wi, error: wiError } = await supabase
    .from("waitlist_items")
    .select("organization_id")
    .eq("id", waitlistItemId)
    .single();

  if (wiError || !wi) return { error: "Waitlist item not found", taskId: null };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      waitlist_item_id: waitlistItemId,
      organization_id:  wi.organization_id,
      name,
      status:   "To Do",
      priority: "Important",
    })
    .select("id")
    .single();

  if (error) return { error: error.message, taskId: null };
  revalidatePath("/waitlist");
  return { error: null, taskId: data.id };
}

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

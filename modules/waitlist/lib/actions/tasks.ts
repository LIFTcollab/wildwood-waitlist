"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type TaskUpdate = {
  task_name: string;
  task_description: string | null;
  task_status: string;
};

export async function updateTask(
  taskId: string,
  data: TaskUpdate
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("waitlist_tasks_view")
    .update(data)
    .eq("task_id", taskId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { error: null };
}

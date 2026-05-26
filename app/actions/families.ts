"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ParentData = {
  first_name:     string;
  last_name:      string;
  email:          string | null;
  phone:          string | null;
  primary_contact: boolean;
  school_history: "Board" | "Teacher" | "Alumni" | null;
};

export async function updateFamilyName(
  id: string,
  name: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("families")
    .update({ name })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/families");
  return { error: null };
}

export async function updateParent(
  id: string,
  data: ParentData
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("parents")
    .update(data)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/families");
  return { error: null };
}

export async function addParent(
  familyId: string,
  organizationId: string,
  data: ParentData
): Promise<{ error: string | null; id: string | null }> {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from("parents")
    .insert({ family_id: familyId, organization_id: organizationId, ...data })
    .select("id")
    .single();
  if (error) return { error: error.message, id: null };
  revalidatePath("/families");
  return { error: null, id: result.id };
}

export async function deleteParent(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("parents").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/families");
  return { error: null };
}

export async function moveChildToFamily(
  childId: string,
  familyId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["Admin", "Director"].includes(profile?.role ?? ""))
    return { error: "Only Admins and Directors can reassign children" };

  const { error } = await supabase
    .from("children")
    .update({ family_id: familyId })
    .eq("id", childId);

  if (error) return { error: error.message };

  revalidatePath("/families");
  revalidatePath("/waitlist");
  return { error: null };
}

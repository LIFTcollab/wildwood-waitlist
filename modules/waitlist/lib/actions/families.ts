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

export async function createFamily(
  name: string
): Promise<{ error: string | null; id: string | null }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", id: null };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!["Admin", "Director"].includes(profile?.role ?? ""))
    return { error: "Only Admins and Directors can create families", id: null };

  if (!profile?.organization_id)
    return { error: "No organization found for your account", id: null };

  const { data, error } = await supabase
    .from("wl_families")
    .insert({ name: name.trim(), organization_id: profile.organization_id })
    .select("id")
    .single();

  if (error || !data)
    return { error: error?.message ?? "Failed to create family", id: null };

  revalidatePath("/settings");
  return { error: null, id: data.id };
}

export async function updateFamilyName(
  id: string,
  name: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wl_families")
    .update({ name })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { error: null };
}

export async function updateParent(
  id: string,
  data: ParentData
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wl_parents")
    .update(data)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { error: null };
}

export async function addParent(
  familyId: string,
  organizationId: string,
  data: ParentData
): Promise<{ error: string | null; id: string | null }> {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from("wl_parents")
    .insert({ family_id: familyId, organization_id: organizationId, ...data })
    .select("id")
    .single();
  if (error) return { error: error.message, id: null };
  revalidatePath("/settings");
  return { error: null, id: result.id };
}

export async function deleteParent(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("wl_parents").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { error: null };
}

export async function deleteFamily(
  id: string
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
    return { error: "Only Admins and Directors can delete families" };

  // Guard: refuse if any children remain
  const { count: childCount } = await supabase
    .from("wl_children")
    .select("id", { count: "exact", head: true })
    .eq("family_id", id);

  if (childCount && childCount > 0)
    return { error: `Cannot delete: ${childCount} ${childCount === 1 ? "child is" : "children are"} still linked to this family` };

  // Guard: refuse if any parents remain
  const { count: parentCount } = await supabase
    .from("wl_parents")
    .select("id", { count: "exact", head: true })
    .eq("family_id", id);

  if (parentCount && parentCount > 0)
    return { error: "Cannot delete: parents are still linked to this family" };

  const { error } = await supabase
    .from("wl_families")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { error: null };
}

export async function moveParentToFamily(
  parentId: string,
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
    return { error: "Only Admins and Directors can reassign parents" };

  const { error } = await supabase
    .from("wl_parents")
    .update({ family_id: familyId })
    .eq("id", parentId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
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
    .from("wl_children")
    .update({ family_id: familyId })
    .eq("id", childId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/waitlist");
  return { error: null };
}

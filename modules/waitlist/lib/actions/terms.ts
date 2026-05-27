"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SchoolTerm } from "@/modules/waitlist/types";

export type TermInput = {
  name:       string;
  status:     string | null; // "Open" | "Closed"
  start_date: string | null; // YYYY-MM-DD
  end_date:   string | null; // YYYY-MM-DD
};

export async function createTerm(
  input: TermInput
): Promise<{ error: string | null; term: SchoolTerm | null }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", term: null };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id)
    return { error: "No organization found for your account", term: null };

  if (!["Admin", "Director"].includes(profile.role))
    return { error: "Only Admins and Directors can manage terms", term: null };

  const { data: term, error } = await supabase
    .from("wl_school_terms")
    .insert({
      name:            input.name.trim(),
      status:          input.status || null,
      start_date:      input.start_date || null,
      end_date:        input.end_date || null,
      organization_id: profile.organization_id,
    })
    .select("id, name, status, start_date, end_date, sort_order")
    .single();

  if (error || !term)
    return { error: error?.message ?? "Failed to create term", term: null };

  revalidatePath("/settings");
  revalidatePath("/waitlist");
  revalidatePath("/dashboard");
  return { error: null, term: term as SchoolTerm };
}

export async function deleteTerm(
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
    return { error: "Only Admins and Directors can manage terms" };

  const { count } = await supabase
    .from("wl_waitlist_items")
    .select("id", { count: "exact", head: true })
    .eq("term_id", id);

  if (count && count > 0)
    return { error: `Cannot delete: ${count} waitlist ${count === 1 ? "entry uses" : "entries use"} this term` };

  const { error } = await supabase
    .from("wl_school_terms")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/waitlist");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function updateTerm(
  id: string,
  input: TermInput
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
    return { error: "Only Admins and Directors can manage terms" };

  const { error } = await supabase
    .from("wl_school_terms")
    .update({
      name:       input.name.trim(),
      status:     input.status || null,
      start_date: input.start_date || null,
      end_date:   input.end_date || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/waitlist");
  revalidatePath("/dashboard");
  return { error: null };
}

"use server";

import { createClient } from "@/lib/supabase/server";

export type IntegrityIssue = {
  issue_type:  string;
  severity:    "error" | "warning";
  description: string;
  family_id:   string | null;
  family_name: string | null;
  entity_id:   string | null;
};

export async function checkDataIntegrity(): Promise<{
  issues: IntegrityIssue[];
  error:  string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("data_integrity_issues")
    .select("issue_type, severity, description, family_id, family_name, entity_id")
    .order("severity")   // errors first
    .order("family_name");

  if (error) return { issues: [], error: error.message };
  return { issues: (data ?? []) as IntegrityIssue[], error: null };
}

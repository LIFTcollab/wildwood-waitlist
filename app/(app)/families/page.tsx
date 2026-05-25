import { createClient } from "@/lib/supabase/server";
import { FamiliesTable, type FamilyRow } from "@/components/dashboard/FamiliesTable";

export const metadata = { title: "Families — Wildwood" };

export default async function FamiliesPage() {
  const supabase = await createClient();

  const { data: families, error } = await supabase
    .from("families")
    .select(
      "id, name, created_at, children(id, first_name, last_name), parents(id, first_name, last_name, primary_contact)"
    )
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="p-8">
        <p className="text-terra text-sm">Failed to load families: {error.message}</p>
      </div>
    );
  }

  const rows = (families ?? []) as FamilyRow[];

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-serif text-[26px] font-medium text-text leading-tight">
          Families
        </h1>
      </div>

      <FamiliesTable families={rows} />
    </div>
  );
}

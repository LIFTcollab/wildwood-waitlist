import { createClient } from "@/lib/supabase/server";
import { FamiliesTable, type FamilyRow } from "@/components/dashboard/FamiliesTable";

export const metadata = { title: "Families — Wildwood" };

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const supabase = await createClient();
  const { open } = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: families, error }, { data: profile }] = await Promise.all([
    supabase
      .from("families")
      .select(
        "id, name, created_at, priority_status, priority_rank, children(id, first_name, last_name), parents(id, first_name, last_name, primary_contact)"
      )
      .order("priority_rank", { ascending: true })
      .order("name",          { ascending: true }),
    user
      ? supabase
          .from("user_profiles_view")
          .select("role")
          .eq("id", user.id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (error) {
    return (
      <div className="p-8">
        <p className="text-terra text-sm">Failed to load families: {error.message}</p>
      </div>
    );
  }

  const canEdit = profile?.role === "Admin" || profile?.role === "Director";
  const rows = (families ?? []) as FamilyRow[];

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-serif text-[26px] font-medium text-text leading-tight">
          Families
        </h1>
        <p className="mt-1 text-[13.5px] text-text-2">
          <span className="font-mono">{rows.length}</span>{" "}
          {rows.length === 1 ? "family" : "families"}
        </p>
      </div>

      <FamiliesTable families={rows} canEdit={canEdit} openFamilyId={open} />
    </div>
  );
}

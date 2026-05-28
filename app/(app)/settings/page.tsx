import { createClient } from "@/lib/supabase/server";
import { FamiliesTable, type FamilyRow } from "@/modules/waitlist/components/FamiliesTable";
import { TermsManager } from "@/modules/waitlist/components/TermsManager";
import { DataIntegrityPanel } from "@/modules/waitlist/components/DataIntegrityPanel";
import type { SchoolTerm } from "@/modules/waitlist/types";

export const metadata = { title: "Admin — Wildwood" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const supabase = await createClient();
  const { open } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: termsData }, { data: familiesData }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("wl_school_terms")
      .select("id, name, status, start_date, end_date, sort_order")
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase
      .from("wl_families")
      .select(
        "id, name, created_at, priority_status, priority_rank, " +
        "children:wl_children(id, first_name, last_name), " +
        "parents:wl_parents(id, first_name, last_name, primary_contact)"
      )
      .order("priority_rank", { ascending: true })
      .order("name",          { ascending: true }),
  ]);

  const canEdit  = ["Admin", "Director"].includes(profile?.role ?? "");
  const isAdmin  = profile?.role === "Admin";
  const terms    = (termsData   ?? []) as SchoolTerm[];
  const families = (familiesData ?? []) as unknown as FamilyRow[];

  return (
    <div className="px-8 py-8">

      {/* Page title */}
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-medium text-text leading-tight">
          Admin
        </h1>
        <p className="mt-1 text-[14px] text-text-2">
          Manage family records, school terms, and data configuration.
        </p>
      </div>

      {/* ── Families ─────────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="font-serif text-[20px] font-medium text-text">
            Families
          </h2>
          <p className="text-[12.5px] text-text-3 mt-0.5">
            Browse and manage family records, parents, and children.
          </p>
        </div>

        <FamiliesTable families={families} canEdit={canEdit} openFamilyId={open} />
      </section>

      {/* ── Terms + Data integrity — constrained width ────────────────── */}
      <div className="max-w-2xl border-t border-border pt-8 space-y-10">

        {/* School terms */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif text-[20px] font-medium text-text">
                School terms
              </h2>
              <p className="text-[12.5px] text-text-3 mt-0.5">
                Terms group waitlist entries by enrollment period.
                {!canEdit && " Contact an Admin or Director to make changes."}
              </p>
            </div>
          </div>

          <TermsManager initialTerms={terms} canEdit={canEdit} isAdmin={isAdmin} />
        </section>

        {/* Data integrity — Admin only */}
        {isAdmin && (
          <section className="border-t border-border pt-8">
            <div className="mb-4">
              <h2 className="font-serif text-[20px] font-medium text-text">
                Data integrity
              </h2>
              <p className="text-[12.5px] text-text-3 mt-0.5">
                Checks families, parents, and children for missing links and inconsistencies.
              </p>
            </div>

            <DataIntegrityPanel />
          </section>
        )}

      </div>
    </div>
  );
}

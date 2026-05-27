import { createClient } from "@/lib/supabase/server";
import { TermsManager } from "@/components/dashboard/TermsManager";
import { DataIntegrityPanel } from "@/components/dashboard/DataIntegrityPanel";
import type { SchoolTerm } from "@/lib/types/waitlist";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: termsData }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("school_terms")
      .select("id, name, status, start_date, end_date, sort_order")
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  const canEdit = ["Admin", "Director"].includes(profile?.role ?? "");
  const isAdmin = profile?.role === "Admin";
  const terms   = (termsData ?? []) as SchoolTerm[];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">

      {/* Page title */}
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-medium text-text leading-tight">
          Settings
        </h1>
        <p className="mt-1 text-[14px] text-text-2">
          Manage school terms and application configuration.
        </p>
      </div>

      {/* Terms section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-[18px] font-medium text-text">
              School terms
            </h2>
            <p className="text-[12.5px] text-text-3 mt-0.5">
              Terms group waitlist entries by enrollment period.
              {!canEdit && " Contact an Admin or Director to make changes."}
            </p>
          </div>
        </div>

        <TermsManager initialTerms={terms} canEdit={canEdit} />
      </section>

      {/* Data integrity section — Admin only */}
      {isAdmin && (
        <section className="border-t border-border pt-8">
          <div className="mb-4">
            <h2 className="font-serif text-[18px] font-medium text-text">
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
  );
}

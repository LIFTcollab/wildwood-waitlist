import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Families — Wildwood" };

// ─── Types ────────────────────────────────────────────────────────────────────

type ChildRow  = { id: string; first_name: string; last_name: string };
type ParentRow = { id: string; first_name: string; last_name: string; primary_contact: boolean };
type FamilyRow = {
  id: string;
  name: string;
  created_at: string;
  children: ChildRow[];
  parents:  ParentRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortedParents(parents: ParentRow[]): ParentRow[] {
  // Primary contact first, then alphabetical
  return [...parents].sort((a, b) => {
    if (a.primary_contact !== b.primary_contact) return a.primary_contact ? -1 : 1;
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });
}

function nameList(rows: { first_name: string; last_name: string }[]): string {
  return rows.map((r) => `${r.first_name} ${r.last_name}`.trim()).join(", ") || "—";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const count = rows.length;

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-serif text-[26px] font-medium text-text leading-tight">
          Families
        </h1>
        <p className="mt-1 text-[13.5px] text-text-2">
          <span className="font-mono">{count}</span>{" "}
          {count === 1 ? "family" : "families"}
        </p>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-[13.5px]">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[32%]" />
            <col className="w-[40%]" />
          </colgroup>
          <thead>
            <tr className="bg-surface-warm border-b border-border">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-3">
                Family Name
              </th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-3">
                Children
              </th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-3">
                Parents
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-text-3 text-[13px] italic">
                  No families found.
                </td>
              </tr>
            ) : (
              rows.map((family) => {
                const orderedParents = sortedParents(family.parents ?? []);
                return (
                  <tr
                    key={family.id}
                    className="hover:bg-surface-warm transition-colors"
                  >
                    {/* Family name */}
                    <td className="px-4 py-3">
                      <span className="font-serif text-[14px] font-medium text-text">
                        {family.name || "—"}
                      </span>
                    </td>

                    {/* Children */}
                    <td className="px-4 py-3">
                      {(family.children ?? []).length === 0 ? (
                        <span className="text-text-3 italic">None</span>
                      ) : (
                        <span className="text-text-2">
                          {nameList(
                            [...(family.children ?? [])].sort((a, b) =>
                              `${a.first_name} ${a.last_name}`.localeCompare(
                                `${b.first_name} ${b.last_name}`
                              )
                            )
                          )}
                        </span>
                      )}
                    </td>

                    {/* Parents */}
                    <td className="px-4 py-3">
                      {orderedParents.length === 0 ? (
                        <span className="text-text-3 italic">None</span>
                      ) : (
                        <span className="text-text-2">
                          {orderedParents
                            .map((p) => `${p.first_name} ${p.last_name}`.trim())
                            .join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

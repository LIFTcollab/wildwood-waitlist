"use client";

import { useState, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FamilyRow = {
  id: string;
  name: string;
  created_at: string;
  children: { id: string; first_name: string; last_name: string; priority_status: string | null }[];
  parents:  { id: string; first_name: string; last_name: string; primary_contact: boolean }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
type PerPage = (typeof PER_PAGE_OPTIONS)[number];

type SortKey = "name" | "children" | "parents" | "priority";
type SortDir = "asc" | "desc";

const PRIORITY_RANK: Record<string, number> = {
  Board: 1, Teacher: 2, Alumni: 3, Sibling: 4, Regular: 5,
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  Board:   { bg: "bg-terra-soft",  text: "text-terra"      },
  Teacher: { bg: "bg-green-soft",  text: "text-green-deep" },
  Alumni:  { bg: "bg-gold-soft",   text: "text-gold"       },
  Sibling: { bg: "bg-blue-soft",   text: "text-blue"       },
  Regular: { bg: "bg-gray-soft",   text: "text-text-2"     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortedParents(
  parents: FamilyRow["parents"]
): FamilyRow["parents"] {
  return [...parents].sort((a, b) => {
    if (a.primary_contact !== b.primary_contact)
      return a.primary_contact ? -1 : 1;
    return `${a.first_name} ${a.last_name}`.localeCompare(
      `${b.first_name} ${b.last_name}`
    );
  });
}

function childrenText(children: FamilyRow["children"]): string {
  return [...children]
    .sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(
        `${b.first_name} ${b.last_name}`
      )
    )
    .map((c) => `${c.first_name} ${c.last_name}`.trim())
    .join(", ");
}

function parentsText(parents: FamilyRow["parents"]): string {
  return sortedParents(parents)
    .map((p) => `${p.first_name} ${p.last_name}`.trim())
    .join(", ");
}

/** Returns the highest-ranked priority across all children in the family. */
function familyPriority(children: FamilyRow["children"]): string | null {
  let best: string | null = null;
  let bestRank = 99;
  for (const child of children) {
    const rank = PRIORITY_RANK[child.priority_status ?? ""] ?? 99;
    if (rank < bestRank) { bestRank = rank; best = child.priority_status; }
  }
  return best;
}

function PriorityPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-text-3">—</span>;
  const s = PRIORITY_STYLES[value];
  if (!s) return <span className="text-text-2 text-[12px]">{value}</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium ${s.bg} ${s.text}`}>
      {value}
    </span>
  );
}

// ─── Sortable header cell ─────────────────────────────────────────────────────

function SortTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={`px-4 py-3 text-[10.5px] uppercase tracking-wide cursor-pointer select-none group text-left ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span
        className={`inline-flex items-center gap-1 font-semibold transition-colors ${
          isActive
            ? "text-green-deep"
            : "text-text-3 group-hover:text-text-2"
        }`}
      >
        {label}
        <span className="font-normal">
          {isActive ? (
            dir === "asc" ? "↑" : "↓"
          ) : (
            <span className="opacity-30">↕</span>
          )}
        </span>
      </span>
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FamiliesTable({ families }: { families: FamilyRow[] }) {
  const [search,   setSearch]   = useState("");
  const [page,     setPage]     = useState(1);
  const [perPage,  setPerPage]  = useState<PerPage>(25);
  const [sortKey,  setSortKey]  = useState<SortKey>("name");
  const [sortDir,  setSortDir]  = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return families;
    return families.filter((f) => {
      if (f.name.toLowerCase().includes(q)) return true;
      if (
        f.children.some(
          (c) =>
            c.first_name.toLowerCase().includes(q) ||
            c.last_name.toLowerCase().includes(q)
        )
      )
        return true;
      if (
        f.parents.some(
          (p) =>
            p.first_name.toLowerCase().includes(q) ||
            p.last_name.toLowerCase().includes(q)
        )
      )
        return true;
      return false;
    });
  }, [families, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") {
        return (a.name ?? "").localeCompare(b.name ?? "") * dir;
      }
      if (sortKey === "children") {
        return (a.children.length - b.children.length) * dir;
      }
      if (sortKey === "parents") {
        return (a.parents.length - b.parents.length) * dir;
      }
      if (sortKey === "priority") {
        const ra = PRIORITY_RANK[familyPriority(a.children) ?? ""] ?? 99;
        const rb = PRIORITY_RANK[familyPriority(b.children) ?? ""] ?? 99;
        return (ra - rb) * dir;
      }
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(sorted.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageRows    = sorted.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  const hasSearch = search !== "";

  return (
    <div>
      {/* ── Filter / control bar ────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m10.5 10.5 3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            placeholder="Search families, children, parents…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8 pr-3 py-1.5 bg-surface border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:border-green transition-colors w-[260px]"
          />
        </div>

        {hasSearch && (
          <button
            onClick={() => {
              setSearch("");
              setPage(1);
            }}
            className="text-[12px] text-text-3 hover:text-terra transition-colors"
          >
            Clear
          </button>
        )}

        {/* Spacer + per-page selector */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-text-3">Show</span>
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value) as PerPage);
              setPage(1);
            }}
            className="px-2 py-1.5 bg-surface border border-border rounded-lg text-[12.5px] text-text-2 focus:outline-none focus:border-green transition-colors cursor-pointer appearance-none pr-6"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Result count */}
      <div className="mb-2 font-mono text-[11.5px] text-text-3">
        {hasSearch
          ? `${filtered.length} of ${families.length} families`
          : `${families.length} families`}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[13.5px] border-collapse">
          <colgroup>
            <col className="w-10" />
            <col className="w-[22%]" />
            <col className="w-px" />
            <col className="w-[30%]" />
            <col />
          </colgroup>
          <thead>
            <tr className="bg-surface-warm border-b border-border text-left">
              <th className="px-4 py-3 text-[10.5px] font-semibold uppercase tracking-wide text-text-3 w-10">
                #
              </th>
              <SortTh
                label="Family Name"
                sortKey="name"
                active={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                label="Priority"
                sortKey="priority"
                active={sortKey}
                dir={sortDir}
                onSort={handleSort}
                className="whitespace-nowrap"
              />
              <SortTh
                label="Children"
                sortKey="children"
                active={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                label="Parents"
                sortKey="parents"
                active={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-14 text-center text-text-3 text-sm"
                >
                  {hasSearch
                    ? "No families match your search."
                    : "No families found."}
                </td>
              </tr>
            ) : (
              pageRows.map((family, i) => {
                const rowNum   = (currentPage - 1) * perPage + i + 1;
                const kids     = childrenText(family.children);
                const parents  = parentsText(family.parents);
                const priority = familyPriority(family.children);

                return (
                  <tr
                    key={family.id}
                    className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-3 text-[11.5px]">
                      {String(rowNum).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-serif text-[14px] font-medium text-text">
                        {family.name || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PriorityPill value={priority} />
                    </td>
                    <td className="px-4 py-3">
                      {family.children.length === 0 ? (
                        <span className="text-text-3 italic text-[13px]">
                          None
                        </span>
                      ) : (
                        <div>
                          <span className="text-text-2 text-[13px]">
                            {kids}
                          </span>
                          <span className="ml-2 font-mono text-[11px] text-text-3">
                            ({family.children.length})
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {family.parents.length === 0 ? (
                        <span className="text-text-3 italic text-[13px]">
                          None
                        </span>
                      ) : (
                        <div>
                          <span className="text-text-2 text-[13px]">
                            {parents}
                          </span>
                          <span className="ml-2 font-mono text-[11px] text-text-3">
                            ({family.parents.length})
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[12px] text-text-3">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-border text-[13px] text-text-2 hover:bg-surface-hover disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-border text-[13px] text-text-2 hover:bg-surface-hover disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

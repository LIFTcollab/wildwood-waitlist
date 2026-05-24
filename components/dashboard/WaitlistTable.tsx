"use client";

import { useState, useMemo } from "react";
import type { WaitlistItem, SchoolTerm } from "@/lib/types/waitlist";
import { ChildDetailPanel } from "./ChildDetailPanel";

// ─── Semantic color maps ────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  Board:   { bg: "bg-terra-soft",  text: "text-terra" },
  Teacher: { bg: "bg-green-soft",  text: "text-green-deep" },
  Alumni:  { bg: "bg-gold-soft",   text: "text-gold" },
  Sibling: { bg: "bg-blue-soft",   text: "text-blue" },
  Regular: { bg: "bg-gray-soft",   text: "text-text-2" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Enrolled:   { bg: "bg-green-soft", text: "text-green-deep" },
  Waitlisted: { bg: "bg-gold-soft",  text: "text-gold" },
  Declined:   { bg: "bg-terra-soft", text: "text-terra" },
  Inactive:   { bg: "bg-gray-soft",  text: "text-text-3" },
};

const STATUSES   = ["Enrolled", "Waitlisted", "Declined", "Inactive"] as const;
const PRIORITIES = ["Board", "Teacher", "Alumni", "Sibling", "Regular"] as const;
const CLASSROOMS = ["Younger Dome", "Older Dome"] as const;

const PER_PAGE = 25;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  // Parse as local date to avoid off-by-one from UTC conversion
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Filter select ──────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const active = value !== "All";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-1.5 rounded-lg text-[12.5px] border cursor-pointer appearance-none pr-7 focus:outline-none transition-colors ${
        active
          ? "bg-green-soft border-green text-green-deep font-medium"
          : "bg-surface border-border text-text-2 hover:border-border-strong"
      }`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
    >
      <option value="All">All {label}s</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ─── Status / priority pills ─────────────────────────────────────────────────

export function PriorityPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-text-3">—</span>;
  const c = PRIORITY_COLORS[value];
  if (!c) return <span className="text-text-2 text-[12px]">{value}</span>;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium ${c.bg} ${c.text}`}
    >
      {value}
    </span>
  );
}

export function StatusPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-text-3">—</span>;
  const c = STATUS_COLORS[value];
  if (!c) return <span className="text-text-2 text-[12px]">{value}</span>;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium ${c.bg} ${c.text}`}
    >
      {value}
    </span>
  );
}

// ─── Main table component ────────────────────────────────────────────────────

export function WaitlistTable({
  items,
  terms,
}: {
  items: WaitlistItem[];
  terms: SchoolTerm[];
}) {
  const [search, setSearch]               = useState("");
  const [filterTerm, setFilterTerm]       = useState("All");
  const [filterStatus, setFilterStatus]   = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterClassroom, setFilterClassroom] = useState("All");
  const [page, setPage]                   = useState(1);
  const [selected, setSelected]           = useState<WaitlistItem | null>(null);

  const termNames = terms.map((t) => t.name);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((item) => {
      if (
        q &&
        !item.child_full_name.toLowerCase().includes(q) &&
        !(item.notes ?? "").toLowerCase().includes(q)
      )
        return false;
      if (filterTerm !== "All" && item.term_name !== filterTerm) return false;
      if (filterStatus !== "All" && item.status !== filterStatus) return false;
      if (filterPriority !== "All" && item.priority_status !== filterPriority)
        return false;
      if (filterClassroom !== "All" && item.classroom !== filterClassroom)
        return false;
      return true;
    });
  }, [items, search, filterTerm, filterStatus, filterPriority, filterClassroom]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems   = filtered.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE
  );

  const hasFilters =
    search !== "" ||
    filterTerm !== "All" ||
    filterStatus !== "All" ||
    filterPriority !== "All" ||
    filterClassroom !== "All";

  function clearFilters() {
    setSearch("");
    setFilterTerm("All");
    setFilterStatus("All");
    setFilterPriority("All");
    setFilterClassroom("All");
    setPage(1);
  }

  function handleFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div>
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search name or notes…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8 pr-3 py-1.5 bg-surface border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:border-green transition-colors w-[220px]"
          />
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border" />

        {/* Filter selects */}
        <FilterSelect
          label="Term"
          value={filterTerm}
          options={termNames}
          onChange={handleFilterChange(setFilterTerm)}
        />
        <FilterSelect
          label="Status"
          value={filterStatus}
          options={[...STATUSES]}
          onChange={handleFilterChange(setFilterStatus)}
        />
        <FilterSelect
          label="Priority"
          value={filterPriority}
          options={[...PRIORITIES]}
          onChange={handleFilterChange(setFilterPriority)}
        />
        <FilterSelect
          label="Classroom"
          value={filterClassroom}
          options={[...CLASSROOMS]}
          onChange={handleFilterChange(setFilterClassroom)}
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[12px] text-text-3 hover:text-terra transition-colors ml-1"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Result count */}
      <div className="mb-2 font-mono text-[11.5px] text-text-3">
        {hasFilters
          ? `${filtered.length} of ${items.length} entries`
          : `${items.length} entries`}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[13.5px] border-collapse">
          <thead>
            <tr className="bg-surface-warm border-b border-border text-left">
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide w-10">
                #
              </th>
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Child
              </th>
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Priority
              </th>
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Term
              </th>
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Classroom
              </th>
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Applied
              </th>
              <th className="px-4 py-3 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-14 text-center text-text-3 text-sm"
                >
                  No results match your filters.
                </td>
              </tr>
            ) : (
              pageItems.map((item, i) => {
                const rowNum = (currentPage - 1) * PER_PAGE + i + 1;
                const isSelected = selected?.id === item.id;
                return (
                  <tr
                    key={item.id}
                    onClick={() =>
                      setSelected(isSelected ? null : item)
                    }
                    className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-green-soft/50"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    {/* # */}
                    <td className="px-4 py-2.5 font-mono text-text-3 text-[11.5px]">
                      {String(rowNum).padStart(2, "0")}
                    </td>

                    {/* Child name + DOB */}
                    <td className="px-4 py-2.5">
                      <div className="font-serif font-medium text-text leading-tight">
                        {item.child_full_name}
                      </div>
                      {item.dob && (
                        <div className="font-mono text-[11px] text-text-3 mt-0.5">
                          {formatDate(item.dob)}
                        </div>
                      )}
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-2.5">
                      <PriorityPill value={item.priority_status} />
                    </td>

                    {/* Term */}
                    <td className="px-4 py-2.5 text-text-2 text-[13px]">
                      {item.term_name ?? "—"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <StatusPill value={item.status} />
                    </td>

                    {/* Classroom */}
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-text-2">
                      {item.classroom ?? "—"}
                    </td>

                    {/* Applied date */}
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-text-3">
                      {item.date_applied ? formatDate(item.date_applied) : "—"}
                    </td>

                    {/* Notes (truncated) */}
                    <td className="px-4 py-2.5 max-w-[180px]">
                      {item.notes ? (
                        <span className="block truncate text-[12.5px] text-text-3">
                          {item.notes}
                        </span>
                      ) : (
                        <span className="text-border-strong">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────── */}
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

      {/* ── Detail panel ───────────────────────────────────────────────── */}
      <ChildDetailPanel
        item={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

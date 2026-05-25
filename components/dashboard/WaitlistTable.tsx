"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { WaitlistItem, SchoolTerm } from "@/lib/types/waitlist";
import { ChildDetailPanel } from "./ChildDetailPanel";

// ─── Semantic color maps ─────────────────────────────────────────────────────

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

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
type PerPage = typeof PER_PAGE_OPTIONS[number];

type SortKey = "child_full_name" | "priority_rank" | "term_name" | "status" | "classroom" | "date_applied";
type SortDir = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Multi-select filter dropdown ─────────────────────────────────────────────

function MultiSelectFilter({
  label,
  plural,
  options,
  selected,
  onChange,
}: {
  label: string;
  plural: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option]
    );
  }

  const isActive = selected.length > 0;
  const buttonLabel =
    selected.length === 0
      ? `All ${plural}`
      : selected.length === 1
      ? `${label}: ${selected[0]}`
      : `${plural} · ${selected.length}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] border cursor-pointer focus:outline-none transition-colors ${
          isActive
            ? "bg-green-soft border-green text-green-deep font-medium"
            : "bg-surface border-border text-text-2 hover:border-border-strong"
        }`}
      >
        {buttonLabel}
        <svg
          viewBox="0 0 10 6"
          fill="none"
          className={`w-2.5 h-1.5 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""} ${isActive ? "text-green" : "text-text-3"}`}
        >
          <path d="m1 1 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-surface border border-border rounded-xl shadow-lg py-1.5 min-w-[168px]">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className="flex items-center gap-2.5 px-3 py-[7px] hover:bg-surface-hover cursor-pointer"
              >
                <div
                  className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                    checked ? "bg-green border-green" : "border-border-strong bg-surface"
                  }`}
                >
                  {checked && (
                    <svg viewBox="0 0 10 8" fill="none" className="w-2 h-2">
                      <path
                        d="M1 4l3 3 5-6"
                        stroke="white"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option)}
                  className="sr-only"
                />
                <span className="text-[13px] text-text leading-none">{option}</span>
              </label>
            );
          })}

          {selected.length > 0 && (
            <>
              <div className="border-t border-border mt-1.5 mb-1" />
              <button
                onClick={() => { onChange([]); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-text-3 hover:text-terra transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status / priority pills ──────────────────────────────────────────────────

export function PriorityPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-text-3">—</span>;
  const c = PRIORITY_COLORS[value];
  if (!c) return <span className="text-text-2 text-[12px]">{value}</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium ${c.bg} ${c.text}`}>
      {value}
    </span>
  );
}

export function StatusPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-text-3">—</span>;
  const c = STATUS_COLORS[value];
  if (!c) return <span className="text-text-2 text-[12px]">{value}</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium ${c.bg} ${c.text}`}>
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
      className={`px-3 py-2.5 text-[10.5px] uppercase tracking-wide cursor-pointer select-none group ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 font-semibold transition-colors ${isActive ? "text-green-deep" : "text-text-3 group-hover:text-text-2"}`}>
        {label}
        <span className="font-normal">
          {isActive ? (dir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
        </span>
      </span>
    </th>
  );
}

// ─── Main table component ─────────────────────────────────────────────────────

export function WaitlistTable({
  items: initialItems,
  terms,
  canEdit,
  taskCounts = {},
}: {
  items: WaitlistItem[];
  terms: SchoolTerm[];
  canEdit: boolean;
  taskCounts?: Record<string, number>;
}) {
  const [localItems, setLocalItems]         = useState<WaitlistItem[]>(initialItems);
  const [search, setSearch]                 = useState("");
  const [filterTerms, setFilterTerms]       = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [filterClassrooms, setFilterClassrooms] = useState<string[]>([]);
  const [page, setPage]                     = useState(1);
  const [perPage, setPerPage]               = useState<PerPage>(25);
  const [selected, setSelected]             = useState<WaitlistItem | null>(null);
  const [sortKey, setSortKey]               = useState<SortKey>("priority_rank");
  const [sortDir, setSortDir]               = useState<SortDir>("asc");

  function handleSave(updated: WaitlistItem) {
    setLocalItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setSelected(updated);
  }

  function withPageReset(setter: (v: string[]) => void) {
    return (v: string[]) => { setter(v); setPage(1); };
  }

  const termNames = terms.map((t) => t.name);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return localItems.filter((item) => {
      if (
        q &&
        !item.child_full_name.toLowerCase().includes(q) &&
        !(item.notes ?? "").toLowerCase().includes(q)
      )
        return false;
      if (filterTerms.length > 0 && !filterTerms.includes(item.term_name ?? ""))
        return false;
      if (filterStatuses.length > 0 && !filterStatuses.includes(item.status ?? ""))
        return false;
      if (filterPriorities.length > 0 && !filterPriorities.includes(item.priority_status ?? ""))
        return false;
      if (filterClassrooms.length > 0 && !filterClassrooms.includes(item.classroom ?? ""))
        return false;
      return true;
    });
  }, [localItems, search, filterTerms, filterStatuses, filterPriorities, filterClassrooms]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "priority_rank") {
        return ((a.priority_rank ?? 99) - (b.priority_rank ?? 99)) * dir;
      }
      const aVal = (a[sortKey] ?? "") as string;
      const bVal = (b[sortKey] ?? "") as string;
      return aVal.localeCompare(bVal) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(sorted.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageItems   = sorted.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  const hasFilters =
    search !== "" ||
    filterTerms.length > 0 ||
    filterStatuses.length > 0 ||
    filterPriorities.length > 0 ||
    filterClassrooms.length > 0;

  function clearFilters() {
    setSearch("");
    setFilterTerms([]);
    setFilterStatuses([]);
    setFilterPriorities([]);
    setFilterClassrooms([]);
    setPage(1);
  }

  return (
    <div>
      {/* ── Filter bar ──────────────────────────────────────────────────── */}
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 pr-3 py-1.5 bg-surface border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:border-green transition-colors w-[220px]"
          />
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border" />

        {/* Multi-select filters */}
        <MultiSelectFilter
          label="Term"
          plural="Terms"
          options={termNames}
          selected={filterTerms}
          onChange={withPageReset(setFilterTerms)}
        />
        <MultiSelectFilter
          label="Status"
          plural="Statuses"
          options={[...STATUSES]}
          selected={filterStatuses}
          onChange={withPageReset(setFilterStatuses)}
        />
        <MultiSelectFilter
          label="Priority"
          plural="Priorities"
          options={[...PRIORITIES]}
          selected={filterPriorities}
          onChange={withPageReset(setFilterPriorities)}
        />
        <MultiSelectFilter
          label="Classroom"
          plural="Classrooms"
          options={[...CLASSROOMS]}
          selected={filterClassrooms}
          onChange={withPageReset(setFilterClassrooms)}
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[12px] text-text-3 hover:text-terra transition-colors ml-1"
          >
            Clear filters
          </button>
        )}

        {/* Spacer + per-page selector */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-text-3">Show</span>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value) as PerPage); setPage(1); }}
            className="px-2 py-1.5 bg-surface border border-border rounded-lg text-[12.5px] text-text-2 focus:outline-none focus:border-green transition-colors cursor-pointer appearance-none pr-6"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Result count */}
      <div className="mb-2 font-mono text-[11.5px] text-text-3">
        {hasFilters
          ? `${filtered.length} of ${localItems.length} entries`
          : `${localItems.length} entries`}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[13.5px] border-collapse">
          <thead>
            <tr className="bg-surface-warm border-b border-border text-left">
              <th className="px-3 py-2.5 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide whitespace-nowrap w-px">
                #
              </th>
              <SortTh label="Child"     sortKey="child_full_name" active={sortKey} dir={sortDir} onSort={handleSort} className="w-[22%]" />
              <SortTh label="Priority"  sortKey="priority_rank"   active={sortKey} dir={sortDir} onSort={handleSort} className="whitespace-nowrap w-px" />
              <SortTh label="Term"      sortKey="term_name"       active={sortKey} dir={sortDir} onSort={handleSort} className="whitespace-nowrap w-px" />
              <SortTh label="Status"    sortKey="status"          active={sortKey} dir={sortDir} onSort={handleSort} className="whitespace-nowrap w-px" />
              <SortTh label="Classroom" sortKey="classroom"       active={sortKey} dir={sortDir} onSort={handleSort} className="whitespace-nowrap w-px" />
              <SortTh label="Applied"   sortKey="date_applied"    active={sortKey} dir={sortDir} onSort={handleSort} className="whitespace-nowrap w-px" />
              <th className="px-3 py-2.5 font-semibold text-text-3 text-[10.5px] uppercase tracking-wide">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center text-text-3 text-sm">
                  No results match your filters.
                </td>
              </tr>
            ) : (
              pageItems.map((item, i) => {
                const rowNum = (currentPage - 1) * perPage + i + 1;
                const isSelected = selected?.id === item.id;
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(isSelected ? null : item)}
                    className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                      isSelected ? "bg-green-soft/50" : "hover:bg-surface-hover"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-text-3 text-[11.5px] whitespace-nowrap">
                      {String(rowNum).padStart(2, "0")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-serif font-medium text-text leading-tight whitespace-nowrap">
                        {item.child_full_name}
                      </div>
                      {item.dob && (
                        <div className="font-mono text-[11px] text-text-3 mt-0.5">
                          {formatDate(item.dob)}
                        </div>
                      )}
                      {(taskCounts[item.id] ?? 0) > 0 && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-terra-soft text-terra font-mono text-[10px] font-medium">
                            ◆ {taskCounts[item.id]} task{taskCounts[item.id] !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <PriorityPill value={item.priority_status} />
                    </td>
                    <td className="px-3 py-2 text-text-2 text-[13px] whitespace-nowrap">
                      {item.term_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <StatusPill value={item.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11.5px] text-text-2 whitespace-nowrap">
                      {item.classroom ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11.5px] text-text-3 whitespace-nowrap">
                      {item.date_applied ? formatDate(item.date_applied) : "—"}
                    </td>
                    <td className="px-3 py-2">
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

      {/* ── Detail panel ────────────────────────────────────────────────── */}
      <ChildDetailPanel
        item={selected}
        terms={terms}
        canEdit={canEdit}
        taskCount={selected ? (taskCounts[selected.id] ?? 0) : 0}
        onClose={() => setSelected(null)}
        onSave={handleSave}
      />
    </div>
  );
}

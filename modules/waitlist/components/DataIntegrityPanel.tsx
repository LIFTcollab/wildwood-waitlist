"use client";

import { useState, useEffect, useCallback } from "react";
import { checkDataIntegrity, type IntegrityIssue } from "@/modules/waitlist/lib/actions/integrity";

// ─── Pagination constants ─────────────────────────────────────────────────────

const PER_PAGE_OPTIONS = [25, 50, 100] as const;
type PerPage = typeof PER_PAGE_OPTIONS[number];

const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 8px center" as const,
};

// ─── Issue type metadata ──────────────────────────────────────────────────────

const ISSUE_META: Record<string, { label: string; icon: string }> = {
  no_parents:               { label: "No parents",               icon: "👤" },
  no_children:              { label: "No children",              icon: "🧒" },
  no_waitlist_entry:        { label: "No waitlist entry",        icon: "📋" },
  no_primary_contact:       { label: "No primary contact",       icon: "☎️"  },
  multiple_primary_contacts:{ label: "Multiple primary contacts",icon: "☎️"  },
  name_drift:               { label: "Name mismatch",            icon: "✏️"  },
  duplicate_email:          { label: "Duplicate email",          icon: "✉️"  },
  orphaned_parent:          { label: "Parent has no family",     icon: "🔗" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: "error" | "warning" }) {
  return severity === "error" ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-terra-soft text-terra">
      Error
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gold-soft text-gold">
      Warning
    </span>
  );
}

function IssueRow({ issue }: { issue: IntegrityIssue }) {
  const meta = ISSUE_META[issue.issue_type] ?? { label: issue.issue_type, icon: "⚠️" };
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <span className="text-[14px] mt-0.5 flex-shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-medium text-text">{meta.label}</span>
          <SeverityBadge severity={issue.severity} />
        </div>
        <p className="text-[12px] text-text-2 mt-0.5">{issue.description}</p>
        {issue.family_name && (
          <p className="font-mono text-[11px] text-text-3 mt-0.5">
            Family: {issue.family_name}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function DataIntegrityPanel() {
  const [issues,     setIssues]     = useState<IntegrityIssue[] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRun,    setLastRun]    = useState<Date | null>(null);
  const [page,       setPage]       = useState(1);
  const [perPage,    setPerPage]    = useState<PerPage>(25);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setPage(1);
    const { issues: rows, error } = await checkDataIntegrity();
    if (error) {
      setFetchError(error);
    } else {
      setIssues(rows);
      setLastRun(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);

  const allIssues  = issues ?? [];
  const errors     = allIssues.filter((i) => i.severity === "error");
  const warnings   = allIssues.filter((i) => i.severity === "warning");
  const allClear   = issues !== null && allIssues.length === 0;

  // Pagination — errors first (already sorted by server action), then warnings
  const totalPages  = Math.max(1, Math.ceil(allIssues.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const visible     = allIssues.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Split visible slice back into error / warning groups for section headers
  const visibleErrors   = visible.filter((i) => i.severity === "error");
  const visibleWarnings = visible.filter((i) => i.severity === "warning");

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">

      {/* Header row */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
        {/* Status */}
        <div className="flex items-center gap-3 min-w-0">
          {loading ? (
            <span className="w-2 h-2 rounded-full bg-border animate-pulse flex-shrink-0" />
          ) : allClear ? (
            <span className="w-2 h-2 rounded-full bg-green flex-shrink-0" />
          ) : errors.length > 0 ? (
            <span className="w-2 h-2 rounded-full bg-terra flex-shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-gold flex-shrink-0" />
          )}
          <div>
            <p className="text-[13px] font-medium text-text">
              {loading
                ? "Running checks…"
                : allClear
                ? "All clear"
                : `${allIssues.length} issue${allIssues.length !== 1 ? "s" : ""} found`}
            </p>
            {lastRun && !loading && (
              <p className="text-[11px] text-text-3 mt-0.5">
                Last checked {lastRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        {/* Controls: per-page + refresh */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!allClear && issues !== null && (
            <>
              <span className="text-[12px] text-text-3">Show</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value) as PerPage); setPage(1); }}
                className="px-2 py-1.5 bg-surface border border-border rounded-lg text-[12.5px] text-text-2 focus:outline-none focus:border-green transition-colors cursor-pointer appearance-none pr-6"
                style={SELECT_STYLE}
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} per page</option>
                ))}
              </select>
            </>
          )}
          <button
            onClick={runCheck}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors disabled:opacity-40"
          >
            {loading ? "Checking…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading && issues === null ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-border/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : fetchError ? (
          <p className="text-[13px] text-terra">{fetchError}</p>
        ) : allClear ? (
          <p className="text-[13px] text-text-2 italic">
            No data integrity issues detected across families, parents, and children.
          </p>
        ) : (
          <>
            <div className="space-y-5">
              {/* Errors on this page */}
              {visibleErrors.length > 0 && (
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-terra mb-2">
                    Errors · {errors.length}
                  </p>
                  <div className="rounded-lg border border-terra/20 bg-terra-soft/30 px-4">
                    {visibleErrors.map((issue, i) => (
                      <IssueRow key={i} issue={issue} />
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings on this page */}
              {visibleWarnings.length > 0 && (
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gold mb-2">
                    Warnings · {warnings.length}
                  </p>
                  <div className="rounded-lg border border-gold/20 bg-gold-soft/30 px-4">
                    {visibleWarnings.map((issue, i) => (
                      <IssueRow key={i} issue={issue} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pagination */}
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
          </>
        )}
      </div>
    </div>
  );
}

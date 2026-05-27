"use client";

import { useState, useEffect, useCallback } from "react";
import { checkDataIntegrity, type IntegrityIssue } from "@/app/actions/integrity";

// ─── Issue type metadata ──────────────────────────────────────────────────────

const ISSUE_META: Record<string, { label: string; icon: string }> = {
  no_parents:              { label: "No parents",              icon: "👤" },
  no_children:             { label: "No children",             icon: "🧒" },
  no_waitlist_entry:       { label: "No waitlist entry",       icon: "📋" },
  no_primary_contact:      { label: "No primary contact",      icon: "☎️"  },
  multiple_primary_contacts:{ label: "Multiple primary contacts", icon: "☎️" },
  name_drift:              { label: "Name mismatch",           icon: "✏️"  },
  duplicate_email:         { label: "Duplicate email",         icon: "✉️"  },
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
  const [issues,    setIssues]    = useState<IntegrityIssue[] | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastRun,   setLastRun]   = useState<Date | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
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

  const errors   = (issues ?? []).filter((i) => i.severity === "error");
  const warnings = (issues ?? []).filter((i) => i.severity === "warning");
  const allClear = issues !== null && issues.length === 0;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">

      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          {/* Status dot */}
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
                : `${issues!.length} issue${issues!.length !== 1 ? "s" : ""} found`}
            </p>
            {lastRun && !loading && (
              <p className="text-[11px] text-text-3 mt-0.5">
                Last checked {lastRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={runCheck}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors disabled:opacity-40"
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
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
          <div className="space-y-5">
            {/* Errors */}
            {errors.length > 0 && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-terra mb-2">
                  Errors · {errors.length}
                </p>
                <div className="rounded-lg border border-terra/20 bg-terra-soft/30 px-4">
                  {errors.map((issue, i) => (
                    <IssueRow key={i} issue={issue} />
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gold mb-2">
                  Warnings · {warnings.length}
                </p>
                <div className="rounded-lg border border-gold/20 bg-gold-soft/30 px-4">
                  {warnings.map((issue, i) => (
                    <IssueRow key={i} issue={issue} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

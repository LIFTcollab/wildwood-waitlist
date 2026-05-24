"use client";

import { useEffect } from "react";
import type { WaitlistItem } from "@/lib/types/waitlist";
import { PriorityPill, StatusPill, formatDate } from "./WaitlistTable";

// ─── Age helper ──────────────────────────────────────────────────────────────

function getAge(dob: string | null): string {
  if (!dob) return "—";
  const [y, m, d] = dob.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  const now   = new Date();
  let years   = now.getFullYear() - birth.getFullYear();
  let months  = now.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (now.getDate() < birth.getDate()) months--;
  if (years === 0) return `${months}mo`;
  if (months === 0) return `${years}y`;
  return `${years}y ${months}mo`;
}

// ─── Field row ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function ChildDetailPanel({
  item,
  onClose,
}: {
  item: WaitlistItem | null;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [item, onClose]);

  if (!item) return null;

  const age = getAge(item.dob);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-text/10 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label={`Details for ${item.child_full_name}`}
        className="fixed right-0 top-0 h-full w-[380px] bg-surface border-l border-border z-50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-serif text-[22px] font-medium text-text leading-tight">
              {item.child_full_name}
            </h2>
            {item.dob && (
              <p className="font-mono text-[12px] text-text-3 mt-1">
                b.&nbsp;{formatDate(item.dob)}&nbsp;·&nbsp;{age}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-hover transition-colors"
          >
            <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Priority */}
          <Field label="Priority">
            <PriorityPill value={item.priority_status} />
          </Field>

          {/* Status + Classroom */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <StatusPill value={item.status} />
            </Field>
            <Field label="Classroom">
              <p className="font-mono text-[12.5px] text-text-2 leading-snug">
                {item.classroom ?? "—"}
              </p>
            </Field>
          </div>

          {/* Term */}
          <Field label="Term">
            <p className="text-[13.5px] text-text-2">{item.term_name ?? "—"}</p>
          </Field>

          {/* Applied */}
          <Field label="Date applied">
            <p className="font-mono text-[12.5px] text-text-2">
              {item.date_applied ? formatDate(item.date_applied) : "—"}
            </p>
          </Field>

          {/* Notes */}
          <Field label="Notes">
            {item.notes ? (
              <p className="text-[13.5px] text-text-2 leading-relaxed whitespace-pre-wrap">
                {item.notes}
              </p>
            ) : (
              <p className="text-[13.5px] text-text-3 italic">No notes</p>
            )}
          </Field>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createWaitlistEntry } from "@/app/actions/children";
import type { WaitlistItem, SchoolTerm } from "@/lib/types/waitlist";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES   = ["Waitlisted", "Enrolled", "Declined", "Inactive"] as const;
const CLASSROOMS = ["Younger Dome", "Older Dome"] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type FamilyOption = {
  id:       string;
  name:     string;
  children: { id: string; first_name: string; last_name: string }[];
};

type FamilyChoice =
  | { kind: "existing"; family: FamilyOption }
  | { kind: "new";      name: string }
  | null;

type ChildForm = {
  first_name: string;
  last_name:  string;
  dob:        string;
};

type WaitlistForm = {
  term_id:      string;
  status:       string;
  classroom:    string;
  date_applied: string;
  notes:        string;
};

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 bg-surface border border-border rounded-lg text-[13px] text-text " +
  "placeholder:text-text-3 focus:outline-none focus:border-green transition-colors";

const selectCls =
  inputCls +
  " appearance-none pr-7 cursor-pointer";

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 10px center" as const,
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Family"  },
    { n: 2, label: "Child"   },
    { n: 3, label: "Waitlist" },
  ] as const;
  return (
    <div className="flex items-center gap-0">
      {steps.map(({ n, label }, i) => {
        const done    = step > n;
        const current = step === n;
        return (
          <div key={n} className="flex items-center">
            {i > 0 && (
              <div className={`w-8 h-px mx-1 ${done ? "bg-green" : "bg-border"}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 transition-colors ${
                  done
                    ? "bg-green text-white"
                    : current
                    ? "bg-green text-white"
                    : "bg-border text-text-3"
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2.5">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : n}
              </div>
              <span className={`text-[12px] font-medium transition-colors ${current ? "text-text" : done ? "text-green" : "text-text-3"}`}>
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Family ───────────────────────────────────────────────────────────

function StepFamily({
  choice,
  onChoose,
}: {
  choice:   FamilyChoice;
  onChoose: (c: FamilyChoice) => void;
}) {
  const [families,   setFamilies]   = useState<FamilyOption[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [newName,    setNewName]    = useState(
    choice?.kind === "new" ? choice.name : ""
  );
  const [mode, setMode]             = useState<"search" | "new">(
    choice?.kind === "new" ? "new" : "search"
  );

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await supabase
          .from("families")
          .select("id, name, children(id, first_name, last_name)")
          .order("name");
        setFamilies((data ?? []) as FamilyOption[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = families.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (f.name.toLowerCase().includes(q)) return true;
    return f.children.some(
      (c) =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q)
    );
  });

  // Keep parent informed as new-family name is typed
  useEffect(() => {
    if (mode === "new") {
      onChoose(newName.trim() ? { kind: "new", name: newName.trim() } : null);
    }
  }, [newName, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectFamily(f: FamilyOption) {
    onChoose({ kind: "existing", family: f });
    setMode("search");
  }

  function switchToNew() {
    setMode("new");
    onChoose(newName.trim() ? { kind: "new", name: newName.trim() } : null);
  }

  function switchToSearch() {
    setMode("search");
    onChoose(null);
  }

  return (
    <div className="space-y-4">
      {mode === "search" ? (
        <>
          {/* Search input */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-3 pointer-events-none" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              type="text"
              placeholder="Search by family name or child name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputCls + " pl-9"}
            />
          </div>

          {/* Results list */}
          <div className="border border-border rounded-xl overflow-hidden max-h-[260px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-[13px] text-text-3 italic">Loading families…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-[13px] text-text-3 italic">No families found.</div>
            ) : (
              filtered.map((f) => {
                const isSelected = choice?.kind === "existing" && choice.family.id === f.id;
                const kidNames = [...f.children]
                  .sort((a, b) =>
                    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
                  )
                  .map((c) => `${c.first_name} ${c.last_name}`)
                  .join(", ");
                return (
                  <button
                    key={f.id}
                    onClick={() => selectFamily(f)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-border last:border-0 transition-colors ${
                      isSelected
                        ? "bg-green-soft"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`font-serif text-[14px] font-medium leading-tight ${isSelected ? "text-green-deep" : "text-text"}`}>
                        {f.name}
                      </p>
                      {f.children.length > 0 && (
                        <p className="text-[11.5px] text-text-3 mt-0.5 truncate">
                          {f.children.length === 1 ? "1 child" : `${f.children.length} children`}
                          {" · "}
                          {kidNames}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <svg viewBox="0 0 14 11" fill="none" className="w-3.5 h-3 flex-shrink-0 ml-3 text-green">
                        <path d="M1 5.5l4 4L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* New family option */}
          <button
            onClick={switchToNew}
            className="flex items-center gap-2 text-[13px] text-green hover:text-green-deep font-medium transition-colors"
          >
            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            Add a new family instead
          </button>
        </>
      ) : (
        <>
          {/* New family name input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
              New family name
            </label>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Garland Family"
              className={inputCls}
            />
            <p className="mt-1.5 text-[11.5px] text-text-3">
              Parents and contact details can be added from the Families page after saving.
            </p>
          </div>

          <button
            onClick={switchToSearch}
            className="text-[13px] text-text-3 hover:text-text transition-colors"
          >
            ← Search for an existing family
          </button>
        </>
      )}
    </div>
  );
}

// ─── Step 2: Child ────────────────────────────────────────────────────────────

function StepChild({
  form,
  familyName,
  onChange,
}: {
  form:       ChildForm;
  familyName: string;
  onChange:   (f: ChildForm) => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  function set(key: keyof ChildForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...form, [key]: e.target.value });
  }

  return (
    <div className="space-y-4">
      {/* Context reminder */}
      <p className="text-[12.5px] text-text-3">
        Adding to{" "}
        <span className="font-serif font-medium text-text">{familyName}</span>
      </p>

      {/* Name row */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
            First name <span className="text-terra">*</span>
          </label>
          <input
            ref={firstRef}
            value={form.first_name}
            onChange={set("first_name")}
            placeholder="First name"
            className={inputCls}
          />
        </div>
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
            Last name <span className="text-terra">*</span>
          </label>
          <input
            value={form.last_name}
            onChange={set("last_name")}
            placeholder="Last name"
            className={inputCls}
          />
        </div>
      </div>

      {/* DOB */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
          Date of birth
        </label>
        <input
          type="date"
          value={form.dob}
          onChange={set("dob")}
          className={inputCls + " font-mono text-[12.5px]"}
        />
      </div>
    </div>
  );
}

// ─── Step 3: Waitlist entry ───────────────────────────────────────────────────

function StepWaitlist({
  form,
  childName,
  terms,
  onChange,
}: {
  form:      WaitlistForm;
  childName: string;
  terms:     SchoolTerm[];
  onChange:  (f: WaitlistForm) => void;
}) {
  function set(key: keyof WaitlistForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [key]: e.target.value });
  }

  return (
    <div className="space-y-4">
      {/* Context reminder */}
      <p className="text-[12.5px] text-text-3">
        Waitlist entry for{" "}
        <span className="font-serif font-medium text-text">{childName}</span>
      </p>

      {/* Term — required */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
          Term <span className="text-terra">*</span>
        </label>
        <select value={form.term_id} onChange={set("term_id")} className={selectCls} style={selectStyle}>
          <option value="">— Select a term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
          Status
        </label>
        <select value={form.status} onChange={set("status")} className={selectCls} style={selectStyle}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Classroom + Date applied */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
            Classroom
          </label>
          <select value={form.classroom} onChange={set("classroom")} className={selectCls} style={selectStyle}>
            <option value="">— None</option>
            {CLASSROOMS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
            Date applied
          </label>
          <input
            type="month"
            value={form.date_applied}
            onChange={set("date_applied")}
            className={inputCls + " font-mono text-[12.5px]"}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={set("notes")}
          rows={3}
          placeholder="Any notes…"
          className={inputCls + " resize-none leading-relaxed"}
        />
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function AddChildModal({
  isOpen,
  terms,
  onClose,
  onCreated,
}: {
  isOpen:    boolean;
  terms:     SchoolTerm[];
  onClose:   () => void;
  onCreated: (item: WaitlistItem) => void;
}) {
  const [step,    setStep]    = useState<1 | 2 | 3>(1);
  const [family,  setFamily]  = useState<FamilyChoice>(null);
  const [child,   setChild]   = useState<ChildForm>({ first_name: "", last_name: "", dob: "" });
  const [wl,      setWl]      = useState<WaitlistForm>({
    term_id: "", status: "Waitlisted", classroom: "", date_applied: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset everything when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFamily(null);
      setChild({ first_name: "", last_name: "", dob: "" });
      setWl({ term_id: "", status: "Waitlisted", classroom: "", date_applied: "", notes: "" });
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Validation ─────────────────────────────────────────────────────────────

  const step1Valid = family !== null;
  const step2Valid = child.first_name.trim().length > 0 && child.last_name.trim().length > 0;
  const step3Valid = wl.term_id !== "";

  const familyName =
    family?.kind === "existing" ? family.family.name :
    family?.kind === "new"      ? family.name         : "";

  const childName = child.first_name.trim()
    ? `${child.first_name.trim()} ${child.last_name.trim()}`.trim()
    : "";

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!family) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await createWaitlistEntry({
      familyId:    family.kind === "existing" ? family.family.id : null,
      familyName:  family.kind === "new"      ? family.name      : null,
      firstName:   child.first_name.trim(),
      lastName:    child.last_name.trim(),
      dob:         child.dob || null,
      termId:      wl.term_id,
      status:      wl.status || "Waitlisted",
      classroom:   wl.classroom || null,
      dateApplied: wl.date_applied || null,
      notes:       wl.notes.trim() || null,
    });

    if (result.error) {
      setSubmitError(result.error);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onCreated(result.item!);
    onClose();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-text/20 z-40 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal card */}
        <div
          className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 className="font-serif text-[20px] font-medium text-text leading-tight">
                Add child to waitlist
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-hover transition-colors flex-shrink-0"
              >
                <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <StepIndicator step={step} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 1 && (
              <StepFamily choice={family} onChoose={setFamily} />
            )}
            {step === 2 && (
              <StepChild
                form={child}
                familyName={familyName}
                onChange={setChild}
              />
            )}
            {step === 3 && (
              <StepWaitlist
                form={wl}
                childName={childName}
                terms={terms}
                onChange={setWl}
              />
            )}

            {submitError && (
              <p className="mt-4 text-[12.5px] text-terra leading-snug">{submitError}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between gap-3">
            {/* Back */}
            <button
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
              disabled={step === 1}
              className="px-4 py-2 rounded-lg text-[13px] text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors disabled:opacity-0 disabled:pointer-events-none"
            >
              ← Back
            </button>

            {/* Next / Submit */}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
                disabled={
                  (step === 1 && !step1Valid) ||
                  (step === 2 && !step2Valid)
                }
                className="px-5 py-2 rounded-lg text-[13px] font-medium text-white bg-green hover:bg-green-deep transition-colors disabled:opacity-40 disabled:cursor-default"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!step3Valid || submitting}
                className="px-5 py-2 rounded-lg text-[13px] font-medium text-white bg-green hover:bg-green-deep transition-colors disabled:opacity-40 disabled:cursor-default"
              >
                {submitting ? "Adding…" : "Add to waitlist"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

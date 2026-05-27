"use client";

import { useState } from "react";
import { createTerm, updateTerm, deleteTerm, type TermInput } from "@/modules/waitlist/lib/actions/terms";
import type { SchoolTerm } from "@/modules/waitlist/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Shared input style ───────────────────────────────────────────────────────

const inputCls =
  "w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[13px] " +
  "text-text placeholder:text-text-3 focus:outline-none focus:border-green transition-colors";

const selectCls =
  inputCls +
  " appearance-none pr-7 cursor-pointer";

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 10px center" as const,
};

// ─── Empty form ───────────────────────────────────────────────────────────────

const EMPTY_FORM: TermInput = {
  name:       "",
  status:     "Open",
  start_date: null,
  end_date:   null,
};

function termToForm(t: SchoolTerm): TermInput {
  return {
    name:       t.name,
    status:     t.status,
    start_date: t.start_date,
    end_date:   t.end_date,
  };
}

// ─── Inline edit form ─────────────────────────────────────────────────────────

function TermForm({
  form,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
  isNew,
}: {
  form:     TermInput;
  saving:   boolean;
  error:    string | null;
  onChange: (f: TermInput) => void;
  onSave:   () => void;
  onCancel: () => void;
  isNew:    boolean;
}) {
  function set(key: keyof TermInput) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: e.target.value || null });
  }

  return (
    <div className="bg-surface-warm border border-border rounded-xl p-4 space-y-3">
      {/* Name + Status row */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1">
            Name <span className="text-terra">*</span>
          </label>
          <input
            autoFocus={isNew}
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="e.g. Fall 26-27"
            className={inputCls}
          />
        </div>
        <div className="w-32 flex-shrink-0">
          <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1">
            Status
          </label>
          <select value={form.status ?? ""} onChange={set("status")} className={selectCls} style={selectStyle}>
            <option value="">—</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Date range row */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1">
            Start date
          </label>
          <input
            type="date"
            value={form.start_date ?? ""}
            onChange={set("start_date")}
            className={inputCls + " font-mono text-[12.5px]"}
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1">
            End date
          </label>
          <input
            type="date"
            value={form.end_date ?? ""}
            onChange={set("end_date")}
            className={inputCls + " font-mono text-[12.5px]"}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[12px] text-terra">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-[12.5px] text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.name.trim()}
          className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium text-white bg-green hover:bg-green-deep transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          {saving ? "Saving…" : isNew ? "Add term" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-text-3 text-[12px]">—</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
      status === "Open"
        ? "bg-green-soft text-green-deep"
        : "bg-gray-soft text-text-2"
    }`}>
      {status}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TermsManager({
  initialTerms,
  canEdit,
  isAdmin = false,
}: {
  initialTerms: SchoolTerm[];
  canEdit: boolean;
  isAdmin?: boolean;
}) {
  const [terms,       setTerms]       = useState<SchoolTerm[]>(initialTerms);
  const [editingId,   setEditingId]   = useState<string | null>(null); // "new" = adding
  const [form,        setForm]        = useState<TermInput>(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [confirmId,   setConfirmId]   = useState<string | null>(null); // id pending delete confirm
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteTerm(id);
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    setTerms((prev) => prev.filter((t) => t.id !== id));
    setConfirmId(null);
    setDeleting(false);
  }

  function startEdit(term: SchoolTerm) {
    setEditingId(term.id);
    setForm(termToForm(term));
    setError(null);
  }

  function startAdd() {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);

    if (editingId === "new") {
      const result = await createTerm(form);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
      // Append and sort by sort_order (nulls last), then name
      setTerms((prev) => {
        const next = [...prev, result.term!];
        return next.sort((a, b) => {
          if (a.sort_order != null && b.sort_order != null)
            return a.sort_order - b.sort_order;
          if (a.sort_order != null) return -1;
          if (b.sort_order != null) return 1;
          return a.name.localeCompare(b.name);
        });
      });
    } else {
      const result = await updateTerm(editingId!, form);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
      setTerms((prev) =>
        prev.map((t) =>
          t.id === editingId
            ? { ...t, name: form.name.trim(), status: form.status, start_date: form.start_date, end_date: form.end_date }
            : t
        )
      );
    }

    setSaving(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="space-y-2">

      {/* Term rows */}
      {terms.length === 0 && editingId !== "new" && (
        <p className="text-[13px] text-text-3 italic py-2">No terms yet.</p>
      )}

      {terms.map((term) =>
        editingId === term.id ? (
          <TermForm
            key={term.id}
            form={form}
            saving={saving}
            error={error}
            onChange={setForm}
            onSave={handleSave}
            onCancel={cancelEdit}
            isNew={false}
          />
        ) : (
          <div
            key={term.id}
            className="flex items-center gap-4 px-4 py-3 bg-surface border border-border rounded-xl"
          >
            {/* Name */}
            <p className="font-serif text-[15px] font-medium text-text leading-tight flex-shrink-0">
              {term.name}
            </p>

            {/* Status */}
            <StatusPill status={term.status} />

            {/* Dates */}
            <div className="flex items-center gap-1 font-mono text-[12px] text-text-3 ml-1">
              <span>{formatDate(term.start_date)}</span>
              {(term.start_date || term.end_date) && (
                <>
                  <span className="mx-1">→</span>
                  <span>{formatDate(term.end_date)}</span>
                </>
              )}
            </div>

            {/* Edit + Delete buttons */}
            {canEdit && editingId === null && (
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                {confirmId === term.id ? (
                  <>
                    <span className="text-[12px] text-terra">Delete this term?</span>
                    <button
                      onClick={() => handleDelete(term.id)}
                      disabled={deleting}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-white bg-terra hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      onClick={() => { setConfirmId(null); setDeleteError(null); }}
                      disabled={deleting}
                      className="px-2.5 py-1 rounded-lg text-[12px] text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(term)}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors"
                    >
                      Edit
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => { setConfirmId(term.id); setDeleteError(null); }}
                        className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-terra border border-border hover:border-terra hover:bg-surface-warm transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
      )}

      {deleteError && (
        <p className="text-[12px] text-terra px-1">{deleteError}</p>
      )}

      {/* Add term form / button */}
      {editingId === "new" ? (
        <TermForm
          form={form}
          saving={saving}
          error={error}
          onChange={setForm}
          onSave={handleSave}
          onCancel={cancelEdit}
          isNew={true}
        />
      ) : canEdit ? (
        <button
          onClick={startAdd}
          disabled={editingId !== null}
          className="flex items-center gap-1.5 text-[13px] text-green hover:text-green-deep font-medium transition-colors disabled:opacity-40 disabled:cursor-default mt-1"
        >
          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          Add term
        </button>
      ) : null}
    </div>
  );
}

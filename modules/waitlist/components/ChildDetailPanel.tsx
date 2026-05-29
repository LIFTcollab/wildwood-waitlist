"use client";

import { useEffect, useState } from "react";
import type { WaitlistItem, SchoolTerm } from "@/modules/waitlist/types";
import { PriorityPill, StatusPill, formatDate, formatMonthYear } from "./WaitlistTable";
import { updateWaitlistItem, createTask } from "@/modules/waitlist/lib/actions/waitlist";
import { updateParent, addParent, deleteParent, type ParentData } from "@/modules/waitlist/lib/actions/families";
import { createClient } from "@/lib/supabase/client";

// ─── Family info types (fetched on demand) ────────────────────────────────────

type ParentInfo  = {
  id:              string;
  first_name:      string;
  last_name:       string;
  email:           string | null;
  phone:           string | null;
  primary_contact: boolean;
  school_history:  "Board" | "Teacher" | "Alumni" | null;
};
type SiblingInfo = { id: string; first_name: string; last_name: string };
type FamilyInfo  = { id: string; name: string; organization_id: string; parents: ParentInfo[]; children: SiblingInfo[] };

type ParentFormEntry = {
  _key:            string;
  id:              string | null;  // null = new, unsaved
  first_name:      string;
  last_name:       string;
  email:           string;
  phone:           string;
  primary_contact: boolean;
  school_history:  string;         // "" | "Board" | "Teacher" | "Alumni"
};

// ─── Task types (fetched on demand) ──────────────────────────────────────────

type TaskInfo = {
  task_id:          string;
  task_name:        string;
  task_status:      string;
  task_description: string | null;
};

const TASK_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  "To Do": { bg: "bg-gray-soft",  text: "text-text-2"    },
  "Doing": { bg: "bg-gold-soft",  text: "text-gold"      },
  "Done":  { bg: "bg-green-soft", text: "text-green-deep" },
};

const TASK_STATUS_NEXT: Record<string, string> = {
  "To Do": "Doing",
  "Doing": "Done",
  "Done":  "To Do",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES   = ["Enrolled", "Waitlisted", "Declined", "Inactive"] as const;
const CLASSROOMS = ["Younger Dome", "Older Dome"] as const;

// ─── Age helper ───────────────────────────────────────────────────────────────

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

// ─── Parent form helpers ──────────────────────────────────────────────────────

let _parentKeyCounter = 0;
function newParentKey() { return `new-${++_parentKeyCounter}`; }

function parentInfoToForm(p: ParentInfo): ParentFormEntry {
  return {
    _key:            p.id,
    id:              p.id,
    first_name:      p.first_name,
    last_name:       p.last_name,
    email:           p.email ?? "",
    phone:           p.phone ?? "",
    primary_contact: p.primary_contact ?? false,
    school_history:  p.school_history ?? "",
  };
}

function formToParentData(p: ParentFormEntry): ParentData {
  return {
    first_name:      p.first_name.trim(),
    last_name:       p.last_name.trim(),
    email:           p.email.trim() || null,
    phone:           p.phone.trim() || null,
    primary_contact: p.primary_contact,
    school_history:  (p.school_history as "Board" | "Teacher" | "Alumni") || null,
  };
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

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

// ─── Shared input / select styles ─────────────────────────────────────────────

const inputCls =
  "w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[13px] text-text focus:outline-none focus:border-green transition-colors";

const selectCls =
  inputCls +
  " appearance-none pr-7 cursor-pointer";

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 10px center" as const,
};

// ─── Form state type ──────────────────────────────────────────────────────────

type FormData = {
  first_name:  string;
  last_name:   string;
  dob:         string;
  status:      string;
  classroom:   string;
  term_id:     string;
  date_applied: string;
  notes:       string;  // waitlist entry notes
  child_notes: string;  // children.notes
};

function itemToForm(item: WaitlistItem): FormData {
  return {
    first_name:   item.first_name ?? "",
    last_name:    item.last_name ?? "",
    dob:          item.dob ?? "",
    status:       item.status ?? "",
    classroom:    item.classroom ?? "",
    term_id:      item.term_id ?? "",
    date_applied: item.date_applied ? item.date_applied.slice(0, 7) : "",
    notes:        item.notes ?? "",
    child_notes:  item.child_notes ?? "",
  };
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function ChildDetailPanel({
  item,
  terms,
  canEdit,
  taskCount = 0,
  onClose,
  onSave,
}: {
  item: WaitlistItem | null;
  terms: SchoolTerm[];
  canEdit: boolean;
  taskCount?: number;
  onClose: () => void;
  onSave: (updated: WaitlistItem) => void;
}) {
  const [isEditing,     setIsEditing]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);
  const [form,          setForm]          = useState<FormData>(() =>
    item ? itemToForm(item) : itemToForm({} as WaitlistItem)
  );
  const [familyInfo,    setFamilyInfo]    = useState<FamilyInfo | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);

  // Parent edit state
  const [isEditingParents, setIsEditingParents] = useState(false);
  const [parentForm,       setParentForm]       = useState<ParentFormEntry[]>([]);
  const [savingParents,    setSavingParents]     = useState(false);
  const [parentSaveError,  setParentSaveError]   = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey]  = useState<string | null>(null);
  const [deleteParentErr,  setDeleteParentErr]   = useState<string | null>(null);

  // Task state
  const [tasks,          setTasks]          = useState<TaskInfo[]>([]);
  const [tasksLoading,   setTasksLoading]   = useState(false);
  const [newTaskName,    setNewTaskName]    = useState("");
  const [addingTask,     setAddingTask]     = useState(false);
  const [taskError,      setTaskError]      = useState<string | null>(null);
  const [editingTaskId,  setEditingTaskId]  = useState<string | null>(null);
  const [editingText,    setEditingText]    = useState("");

  // Reset edit state when a different item is opened
  useEffect(() => {
    if (!item) return;
    setForm(itemToForm(item));
    setIsEditing(false);
    setSaving(false);
    setSaveError(null);
    setEditingTaskId(null);
    setEditingText("");
    setIsEditingParents(false);
    setParentForm([]);
    setParentSaveError(null);
    setConfirmDeleteKey(null);
    setDeleteParentErr(null);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch family info whenever the selected child changes
  useEffect(() => {
    if (!item?.child_id) { setFamilyInfo(null); return; }
    setFamilyInfo(null);   // clear stale data immediately before fetch
    setFamilyLoading(true);
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await supabase
          .from("wl_children")
          .select("families:wl_families(id, name, organization_id, parents:wl_parents(id, first_name, last_name, email, phone, primary_contact, school_history), children:wl_children(id, first_name, last_name))")
          .eq("id", item.child_id)
          .single();
        setFamilyInfo((data?.families as unknown as FamilyInfo) ?? null);
      } finally {
        setFamilyLoading(false);
      }
    })();
  }, [item?.child_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch tasks whenever the selected waitlist item changes
  useEffect(() => {
    if (!item?.id) { setTasks([]); return; }
    setTasksLoading(true);
    setNewTaskName("");
    setTaskError(null);
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await supabase
          .from("waitlist_tasks_view")
          .select("task_id, task_name, task_status, task_description")
          .eq("waitlist_item_id", item.id)
          .order("created_at", { ascending: true });
        setTasks((data ?? []) as TaskInfo[]);
      } finally {
        setTasksLoading(false);
      }
    })();
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditingParents) { handleCancelParents(); }
        else if (isEditing) { setIsEditing(false); setSaveError(null); }
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [item, isEditing, isEditingParents, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;

  const age = getAge(isEditing ? form.dob || null : item.dob);

  function set(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    setSaveError(null);

    const result = await updateWaitlistItem(item.id, {
      first_name:   form.first_name,
      last_name:    form.last_name,
      dob:          form.dob || null,
      status:       form.status || null,
      classroom:    form.classroom || null,
      term_id:      form.term_id,
      date_applied: form.date_applied ? form.date_applied + "-01" : null,
      notes:        form.notes || null,
      child_notes:  form.child_notes || null,
    });

    if (result.error) {
      setSaveError(result.error);
      setSaving(false);
      return;
    }

    const termName = terms.find((t) => t.id === form.term_id)?.name ?? item.term_name;
    const updated: WaitlistItem = {
      ...item,
      first_name:      form.first_name,
      last_name:       form.last_name,
      child_full_name: `${form.first_name} ${form.last_name}`.trim(),
      dob:             form.dob || null,
      // priority_status and priority_rank are computed by the DB — carry through unchanged
      priority_status: item.priority_status,
      priority_rank:   item.priority_rank,
      status:          form.status || null,
      classroom:       form.classroom || null,
      term_id:         form.term_id,
      term_name:       termName ?? null,
      date_applied:    form.date_applied ? form.date_applied + "-01" : null,
      notes:       form.notes || null,
      child_notes: form.child_notes || null,
    };

    onSave(updated);
    setIsEditing(false);
    setSaving(false);
  }

  function handleCancel() {
    if (!item) return;
    setForm(itemToForm(item));
    setIsEditing(false);
    setSaveError(null);
  }

  // ── Parent editing ─────────────────────────────────────────────────────────

  function startEditParents() {
    if (!familyInfo) return;
    setParentForm(familyInfo.parents.map(parentInfoToForm));
    setParentSaveError(null);
    setConfirmDeleteKey(null);
    setDeleteParentErr(null);
    setIsEditingParents(true);
  }

  function handleCancelParents() {
    setIsEditingParents(false);
    setParentForm([]);
    setParentSaveError(null);
    setConfirmDeleteKey(null);
    setDeleteParentErr(null);
  }

  function setParentField(key: string, field: keyof ParentFormEntry, value: unknown) {
    setParentForm((prev) =>
      prev.map((p) => p._key === key ? { ...p, [field]: value } : p)
    );
  }

  function addNewParent() {
    const k = newParentKey();
    setParentForm((prev) => [
      ...prev,
      { _key: k, id: null, first_name: "", last_name: "", email: "", phone: "", primary_contact: false, school_history: "" },
    ]);
  }

  async function handleDeleteParent(p: ParentFormEntry) {
    setDeleteParentErr(null);
    if (p.id === null) {
      setParentForm((prev) => prev.filter((fp) => fp._key !== p._key));
      setConfirmDeleteKey(null);
      return;
    }
    const result = await deleteParent(p.id);
    if (result.error) {
      setDeleteParentErr(result.error);
      setConfirmDeleteKey(null);
      return;
    }
    setFamilyInfo((prev) =>
      prev ? { ...prev, parents: prev.parents.filter((fp) => fp.id !== p.id) } : prev
    );
    setParentForm((prev) => prev.filter((fp) => fp._key !== p._key));
    setConfirmDeleteKey(null);
  }

  async function handleSaveParents() {
    if (!familyInfo || !item) return;
    setSavingParents(true);
    setParentSaveError(null);

    // Update existing parents in parallel
    const existing = parentForm.filter((p) => p.id !== null);
    const updateResults = await Promise.all(
      existing.map((p) => updateParent(p.id!, formToParentData(p)))
    );
    const updateError = updateResults.find((r) => r.error);
    if (updateError?.error) {
      setParentSaveError(updateError.error);
      setSavingParents(false);
      return;
    }

    // Insert new parents sequentially (need returned ids)
    const newParentIds: Record<string, string> = {};
    for (const p of parentForm.filter((fp) => fp.id === null)) {
      const r = await addParent(familyInfo.id, formToParentData(p));
      if (r.error) {
        setParentSaveError(r.error);
        setSavingParents(false);
        return;
      }
      if (r.id) newParentIds[p._key] = r.id;
    }

    // Build updated parents list
    const updatedParents: ParentInfo[] = parentForm.map((p) => ({
      id:              p.id ?? newParentIds[p._key] ?? "",
      first_name:      p.first_name.trim(),
      last_name:       p.last_name.trim(),
      email:           p.email.trim() || null,
      phone:           p.phone.trim() || null,
      primary_contact: p.primary_contact,
      school_history:  (p.school_history as "Board" | "Teacher" | "Alumni") || null,
    }));

    // Re-fetch priority — DB trigger may have changed it
    const supabase = createClient();
    const { data: refreshed } = await supabase
      .from("wl_families")
      .select("priority_status, priority_rank")
      .eq("id", familyInfo.id)
      .single();

    // Update panel local state
    setFamilyInfo((prev) => prev ? { ...prev, parents: updatedParents } : prev);

    // Push refreshed priority back to the Waitlist table row
    onSave({
      ...item,
      priority_status: refreshed?.priority_status ?? item.priority_status,
      priority_rank:   (refreshed?.priority_rank as number | null | undefined) ?? item.priority_rank,
    });

    setIsEditingParents(false);
    setParentForm([]);
    setSavingParents(false);
  }

  // Cycle a task's status: To Do → Doing → Done → To Do
  async function cycleTaskStatus(taskId: string, currentStatus: string) {
    if (!canEdit) return;
    const nextStatus = TASK_STATUS_NEXT[currentStatus] ?? "To Do";
    const prevTasks = tasks;
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => t.task_id === taskId ? { ...t, task_status: nextStatus } : t)
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("wl_tasks")
      .update({ status: nextStatus })
      .eq("id", taskId);
    if (error) {
      setTasks(prevTasks);
      setTaskError(error.message);
    }
  }

  // Add a new task for this waitlist item.
  // task.name is auto-built server-side ("Child: Term"); user provides description.
  async function handleAddTask() {
    if (!newTaskName.trim() || !item) return;
    setAddingTask(true);
    setTaskError(null);
    const result = await createTask(item.id, newTaskName.trim());
    if (result.error) {
      setTaskError(result.error);
    } else if (result.taskId) {
      setTasks((prev) => [
        ...prev,
        {
          task_id:          result.taskId!,
          task_name:        result.taskName ?? "",
          task_status:      "To Do",
          task_description: newTaskName.trim(),
        },
      ]);
      setNewTaskName("");
    }
    setAddingTask(false);
  }

  // Task inline edit handlers — edit only the description, not the auto-generated name
  function startTaskEdit(task: TaskInfo) {
    setEditingTaskId(task.task_id);
    setEditingText(task.task_description ?? "");
  }

  function cancelTaskEdit() {
    setEditingTaskId(null);
    setEditingText("");
  }

  async function saveTaskEdit(taskId: string) {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const prevTasks = tasks;
    const prevEditingText = editingText;
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => t.task_id === taskId ? { ...t, task_description: trimmed } : t)
    );
    setEditingTaskId(null);
    setEditingText("");
    const supabase = createClient();
    const { error } = await supabase
      .from("wl_tasks")
      .update({ description: trimmed })
      .eq("id", taskId);
    if (error) {
      // Rollback — reopen the edit so the user can try again
      setTasks(prevTasks);
      setEditingTaskId(taskId);
      setEditingText(prevEditingText);
      setTaskError(error.message);
    }
  }

  const displayName = isEditing
    ? `${form.first_name} ${form.last_name}`.trim() || "—"
    : item.child_full_name;

  const displayDob = isEditing ? form.dob : item.dob;

  // Badge count: use loaded tasks once available, fall back to prop while loading
  const openCount = tasksLoading
    ? taskCount
    : tasks.filter((t) => t.task_status !== "Done").length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-text/10 z-40"
        onClick={isEditing ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label={`Details for ${item.child_full_name}`}
        className="fixed right-0 top-0 h-full w-[440px] bg-surface border-l border-border z-50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 flex-shrink-0">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="flex gap-2">
                <input
                  value={form.first_name}
                  onChange={set("first_name")}
                  placeholder="First name"
                  className={inputCls + " text-[15px] font-medium"}
                />
                <input
                  value={form.last_name}
                  onChange={set("last_name")}
                  placeholder="Last name"
                  className={inputCls + " text-[15px] font-medium"}
                />
              </div>
            ) : (
              <h2 className="font-serif text-[22px] font-medium text-text leading-tight">
                {displayName}
              </h2>
            )}
            {isEditing ? (
              <div className="mt-2">
                <input
                  type="date"
                  value={form.dob}
                  onChange={set("dob")}
                  className={inputCls + " font-mono text-[12px]"}
                />
              </div>
            ) : (
              <>
                {displayDob && (
                  <p className="font-mono text-[12px] text-text-3 mt-1">
                    b.&nbsp;{formatDate(displayDob)}&nbsp;·&nbsp;{age}
                  </p>
                )}
                {openCount > 0 && (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded-full bg-terra-soft text-terra font-mono text-[10.5px] font-medium">
                    ◆ {openCount} open task{openCount !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors"
              >
                Edit
              </button>
            )}
            <button
              onClick={isEditing ? handleCancel : onClose}
              aria-label={isEditing ? "Cancel edit" : "Close panel"}
              className="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-hover transition-colors"
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Priority — auto-computed from parent school_history + siblings; always read-only */}
          <Field label="Priority">
            <div className="flex items-center gap-2">
              <PriorityPill value={item.priority_status} />
              <span className="text-[11px] text-text-3 italic">auto-computed</span>
            </div>
          </Field>

          {/* Status + Classroom */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              {isEditing ? (
                <select value={form.status} onChange={set("status")} className={selectCls} style={selectStyle}>
                  <option value="">— None</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <StatusPill value={item.status} />
              )}
            </Field>
            <Field label="Classroom">
              {isEditing ? (
                <select value={form.classroom} onChange={set("classroom")} className={selectCls} style={selectStyle}>
                  <option value="">— None</option>
                  {CLASSROOMS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <p className="font-mono text-[12.5px] text-text-2 leading-snug">
                  {item.classroom ?? "—"}
                </p>
              )}
            </Field>
          </div>

          {/* Term */}
          <Field label="Term">
            {isEditing ? (
              <select value={form.term_id} onChange={set("term_id")} className={selectCls} style={selectStyle}>
                <option value="">— Select term</option>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <p className="text-[13.5px] text-text-2">{item.term_name ?? "—"}</p>
            )}
          </Field>

          {/* Applied */}
          <Field label="Date applied">
            {isEditing ? (
              <input
                type="month"
                value={form.date_applied}
                onChange={set("date_applied")}
                className={inputCls + " font-mono text-[12px]"}
              />
            ) : (
              <p className="font-mono text-[12.5px] text-text-2">
                {item.date_applied ? formatMonthYear(item.date_applied) : "—"}
              </p>
            )}
          </Field>

          {/* Child notes (children.notes — persists across all terms) */}
          <Field label="Child record notes">
            {isEditing ? (
              <textarea
                value={form.child_notes}
                onChange={set("child_notes")}
                rows={3}
                placeholder="Notes about this child (not term-specific)…"
                className={inputCls + " resize-none leading-relaxed"}
              />
            ) : item.child_notes ? (
              <p className="text-[13.5px] text-text-2 leading-relaxed whitespace-pre-wrap">
                {item.child_notes}
              </p>
            ) : (
              <p className="text-[13.5px] text-text-3 italic">None</p>
            )}
          </Field>

          {/* Waitlist notes (waitlist_items.notes — specific to this term entry) */}
          <Field label="Waitlist notes">
            {isEditing ? (
              <textarea
                value={form.notes}
                onChange={set("notes")}
                rows={3}
                placeholder="Notes about this waitlist entry…"
                className={inputCls + " resize-none leading-relaxed"}
              />
            ) : item.notes ? (
              <p className="text-[13.5px] text-text-2 leading-relaxed whitespace-pre-wrap">
                {item.notes}
              </p>
            ) : (
              <p className="text-[13.5px] text-text-3 italic">None</p>
            )}
          </Field>

          {/* ── Family + Tasks sections ───────────────────────────────── */}
          <>
            {/* ── Family ─────────────────────────────────────────────── */}
              <div className="border-t border-border" />

              {familyLoading ? (
                <p className="text-[12px] text-text-3 italic">Loading family…</p>
              ) : familyInfo ? (
                <>
                  {/* ── Parents — section-level edit ── */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">
                        Parents
                      </div>
                      {canEdit && !isEditing && !isEditingParents && (
                        <button
                          onClick={startEditParents}
                          className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {isEditingParents ? (
                      /* ── Edit mode ── */
                      <div className="space-y-3">
                        {deleteParentErr && (
                          <p className="text-[12px] text-terra">{deleteParentErr}</p>
                        )}

                        {parentForm.map((p) => (
                          <div key={p._key} className="rounded-xl border border-border p-3.5 space-y-2 bg-surface-warm">
                            {/* Name */}
                            <div className="flex gap-2">
                              <input
                                value={p.first_name}
                                onChange={(e) => setParentField(p._key, "first_name", e.target.value)}
                                placeholder="First name"
                                className={inputCls}
                              />
                              <input
                                value={p.last_name}
                                onChange={(e) => setParentField(p._key, "last_name", e.target.value)}
                                placeholder="Last name"
                                className={inputCls}
                              />
                            </div>

                            {/* Email */}
                            <input
                              type="email"
                              value={p.email}
                              onChange={(e) => setParentField(p._key, "email", e.target.value)}
                              placeholder="Email"
                              className={inputCls}
                            />

                            {/* Phone */}
                            <input
                              type="tel"
                              value={p.phone}
                              onChange={(e) => setParentField(p._key, "phone", e.target.value)}
                              placeholder="Phone"
                              className={inputCls}
                            />

                            {/* Primary contact + school history + delete */}
                            <div className="flex items-center gap-3 pt-0.5">
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <div className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                                  p.primary_contact ? "bg-green border-green" : "border-border-strong bg-surface"
                                }`}>
                                  {p.primary_contact && (
                                    <svg viewBox="0 0 10 8" fill="none" className="w-2 h-2">
                                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={p.primary_contact}
                                  onChange={() => setParentField(p._key, "primary_contact", !p.primary_contact)}
                                />
                                <span className="text-[12px] text-text-2">Primary</span>
                              </label>

                              <select
                                value={p.school_history}
                                onChange={(e) => setParentField(p._key, "school_history", e.target.value)}
                                className="flex-1 px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[12px] text-text focus:outline-none focus:border-green transition-colors appearance-none cursor-pointer pr-6"
                                style={selectStyle}
                              >
                                <option value="">No history</option>
                                <option value="Board">Board</option>
                                <option value="Teacher">Teacher</option>
                                <option value="Alumni">Alumni</option>
                              </select>

                              {confirmDeleteKey === p._key ? (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className="text-[11.5px] text-terra font-medium">Delete?</span>
                                  <button
                                    onClick={() => handleDeleteParent(p)}
                                    className="text-[11.5px] text-terra font-semibold hover:underline"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteKey(null)}
                                    className="text-[11.5px] text-text-3 hover:underline"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteKey(p._key)}
                                  className="flex-shrink-0 text-[12px] text-text-3 hover:text-terra transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Add parent */}
                        <button
                          onClick={addNewParent}
                          className="flex items-center gap-1.5 text-[12.5px] text-green hover:text-green-deep font-medium transition-colors"
                        >
                          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                          </svg>
                          Add parent
                        </button>

                        {parentSaveError && (
                          <p className="text-[12px] text-terra">{parentSaveError}</p>
                        )}

                        {/* Save / Cancel */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={handleSaveParents}
                            disabled={savingParents}
                            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-white bg-green hover:bg-green-deep transition-colors disabled:opacity-50"
                          >
                            {savingParents ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={handleCancelParents}
                            disabled={savingParents}
                            className="text-[12.5px] text-text-3 hover:text-text transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      familyInfo.parents.length === 0 ? (
                        <p className="text-[13px] text-text-3 italic">None on record</p>
                      ) : (
                        <div className="space-y-3">
                          {[...familyInfo.parents]
                            .sort((a, b) => {
                              if (a.primary_contact !== b.primary_contact)
                                return a.primary_contact ? -1 : 1;
                              return `${a.first_name} ${a.last_name}`.localeCompare(
                                `${b.first_name} ${b.last_name}`
                              );
                            })
                            .map((p) => (
                              <div key={p.id} className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-serif text-[14px] font-medium text-text">
                                    {p.first_name} {p.last_name}
                                  </span>
                                  {p.primary_contact && (
                                    <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
                                      primary
                                    </span>
                                  )}
                                  {p.school_history && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-medium ${
                                      p.school_history === "Board"
                                        ? "bg-terra-soft text-terra"
                                        : p.school_history === "Teacher"
                                        ? "bg-green-soft text-green-deep"
                                        : "bg-gold-soft text-gold"
                                    }`}>
                                      {p.school_history}
                                    </span>
                                  )}
                                </div>
                                {p.email && (
                                  <p className="text-[12.5px] text-text-2">{p.email}</p>
                                )}
                                {p.phone && (
                                  <p className="font-mono text-[12px] text-text-2">{p.phone}</p>
                                )}
                              </div>
                            ))}
                        </div>
                      )
                    )}
                  </div>

                  {(() => {
                    const siblings = familyInfo.children.filter(
                      (c) => c.id !== item?.child_id
                    );
                    return (
                      <Field label="Siblings">
                        {siblings.length === 0 ? (
                          <p className="text-[13px] text-text-3 italic">None</p>
                        ) : (
                          <div className="space-y-1">
                            {siblings.map((s) => (
                              <p key={s.id} className="text-[13px] text-text-2">
                                {s.first_name} {s.last_name}
                              </p>
                            ))}
                          </div>
                        )}
                      </Field>
                    );
                  })()}
                </>
              ) : null}

              {/* ── Tasks ──────────────────────────────────────────────── */}
              <div className="border-t border-border" />

              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-3">
                  Tasks
                </div>

                {tasksLoading ? (
                  <p className="text-[12px] text-text-3 italic">Loading tasks…</p>
                ) : (
                  <div className="space-y-2.5">
                    {tasks.length === 0 && (
                      <p className="text-[13px] text-text-3 italic">No tasks yet.</p>
                    )}

                    {tasks.map((task) => {
                      const style = TASK_STATUS_STYLES[task.task_status] ?? TASK_STATUS_STYLES["To Do"];
                      const isEditingThis = editingTaskId === task.task_id;
                      const displayText = task.task_description || task.task_name;
                      return (
                        <div key={task.task_id} className="flex items-start gap-2.5 group">
                          {/* Status pill — clickable (cycles status) for editors, static for viewers */}
                          {canEdit ? (
                            <button
                              onClick={() => cycleTaskStatus(task.task_id, task.task_status)}
                              title="Click to advance status"
                              className={`mt-0.5 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium hover:opacity-70 transition-opacity ${style.bg} ${style.text}`}
                            >
                              {task.task_status}
                            </button>
                          ) : (
                            <span
                              className={`mt-0.5 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium ${style.bg} ${style.text}`}
                            >
                              {task.task_status}
                            </span>
                          )}

                          {isEditingThis ? (
                            /* ── Inline edit mode ── */
                            <div className="flex-1 flex flex-col gap-1 min-w-0">
                              <p className="text-[11px] text-text-3 truncate">{task.task_name}</p>
                              <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")  saveTaskEdit(task.task_id);
                                  if (e.key === "Escape") cancelTaskEdit();
                                }}
                                placeholder="Add a description…"
                                className="flex-1 min-w-0 px-2 py-1 bg-surface border border-green rounded-md text-[12.5px] text-text focus:outline-none"
                              />
                              {/* Save */}
                              <button
                                onClick={() => saveTaskEdit(task.task_id)}
                                disabled={!editingText.trim()}
                                title="Save"
                                className="flex-shrink-0 p-1 rounded text-green hover:text-green-deep disabled:opacity-40 transition-colors"
                              >
                                <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
                                  <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              {/* Cancel */}
                              <button
                                onClick={cancelTaskEdit}
                                title="Cancel"
                                className="flex-shrink-0 p-1 rounded text-text-3 hover:text-text transition-colors"
                              >
                                <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
                                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                                </svg>
                              </button>
                              </div>
                            </div>
                          ) : (
                            /* ── View mode — pencil appears on row hover ── */
                            <div className="flex-1 flex items-center gap-1 min-w-0">
                              <p className="flex-1 text-[13px] text-text-2 leading-snug">
                                {displayText}
                              </p>
                              {canEdit && (
                                <button
                                  onClick={() => startTaskEdit(task)}
                                  title="Edit task"
                                  className="flex-shrink-0 p-1 rounded text-text-3 hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3">
                                    <path d="M9.5 1.5a1.5 1.5 0 0 1 2.121 0l.879.879a1.5 1.5 0 0 1 0 2.121L5 12H2v-3L9.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add task input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newTaskName}
                        onChange={(e) => setNewTaskName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
                        placeholder="Describe the task…"
                        disabled={addingTask}
                        className="flex-1 px-2.5 py-1.5 bg-surface-warm border border-border rounded-lg text-[12.5px] text-text placeholder:text-text-3 focus:outline-none focus:border-green transition-colors disabled:opacity-50"
                      />
                      <button
                        onClick={handleAddTask}
                        disabled={!newTaskName.trim() || addingTask}
                        className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-white bg-green hover:bg-green-deep transition-colors disabled:opacity-40 disabled:cursor-default"
                      >
                        {addingTask ? "…" : "Add"}
                      </button>
                    </div>

                    {taskError && (
                      <p className="text-[12px] text-terra">{taskError}</p>
                    )}
                  </div>
                )}
              </div>
          </>

          {/* Save error */}
          {saveError && (
            <p className="text-[12.5px] text-terra leading-snug">{saveError}</p>
          )}
        </div>

        {/* Footer — edit mode only */}
        {isEditing && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-[13px] text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-green hover:bg-green-deep transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

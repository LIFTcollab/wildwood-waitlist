"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WaitlistItem, SchoolTerm } from "@/lib/types/waitlist";
import { PriorityPill, StatusPill, formatDate, formatMonthYear } from "./WaitlistTable";
import { updateWaitlistItem, createTask } from "@/app/actions/waitlist";
import { createClient } from "@/lib/supabase/client";

// ─── Family info types (fetched on demand) ────────────────────────────────────

type ParentInfo  = { id: string; first_name: string; last_name: string; primary_contact: boolean };
type SiblingInfo = { id: string; first_name: string; last_name: string };
type FamilyInfo  = { id: string; name: string; parents: ParentInfo[]; children: SiblingInfo[] };

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
const PRIORITIES = ["Board", "Teacher", "Alumni", "Sibling", "Regular"] as const;
const CLASSROOMS = ["Younger Dome", "Older Dome"] as const;
const PRIORITY_RANK: Record<string, number> = {
  Board: 1, Teacher: 2, Alumni: 3, Sibling: 4, Regular: 5,
};

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
  first_name: string;
  last_name: string;
  dob: string;
  priority_status: string;
  status: string;
  classroom: string;
  term_id: string;
  date_applied: string;
  notes: string;
};

function itemToForm(item: WaitlistItem): FormData {
  return {
    first_name:      item.first_name ?? "",
    last_name:       item.last_name ?? "",
    dob:             item.dob ?? "",
    priority_status: item.priority_status ?? "",
    status:          item.status ?? "",
    classroom:       item.classroom ?? "",
    term_id:         item.term_id ?? "",
    date_applied:    item.date_applied ? item.date_applied.slice(0, 7) : "",
    notes:           item.notes ?? "",
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
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch family info whenever the selected child changes
  useEffect(() => {
    if (!item?.child_id) { setFamilyInfo(null); return; }
    setFamilyLoading(true);
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await supabase
          .from("children")
          .select("families(id, name, parents(id, first_name, last_name, primary_contact), children(id, first_name, last_name))")
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
        if (isEditing) { setIsEditing(false); setSaveError(null); }
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [item, isEditing, onClose]);

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
      first_name:      form.first_name,
      last_name:       form.last_name,
      dob:             form.dob || null,
      priority_status: form.priority_status || null,
      status:          form.status || null,
      classroom:       form.classroom || null,
      term_id:         form.term_id,
      date_applied:    form.date_applied ? form.date_applied + "-01" : null,
      notes:           form.notes || null,
    });

    if (result.error) {
      setSaveError(result.error);
      setSaving(false);
      return;
    }

    const termName = terms.find((t) => t.id === form.term_id)?.name ?? item.term_name;
    const updated: WaitlistItem = {
      ...item,
      first_name:       form.first_name,
      last_name:        form.last_name,
      child_full_name:  `${form.first_name} ${form.last_name}`.trim(),
      dob:              form.dob || null,
      priority_status:  form.priority_status || null,
      priority_rank:    PRIORITY_RANK[form.priority_status] ?? 99,
      status:           form.status || null,
      classroom:        form.classroom || null,
      term_id:          form.term_id,
      term_name:        termName ?? null,
      date_applied:     form.date_applied ? form.date_applied + "-01" : null,
      notes:            form.notes || null,
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
      .from("tasks")
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

  // Task inline edit handlers
  function startTaskEdit(task: TaskInfo) {
    setEditingTaskId(task.task_id);
    setEditingText(task.task_description || task.task_name);
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
      .from("tasks")
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
        className="fixed right-0 top-0 h-full w-[400px] bg-surface border-l border-border z-50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-border flex-shrink-0">
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

          {/* Priority */}
          <Field label="Priority">
            {isEditing ? (
              <select value={form.priority_status} onChange={set("priority_status")} className={selectCls} style={selectStyle}>
                <option value="">— None</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <PriorityPill value={item.priority_status} />
            )}
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

          {/* Notes */}
          <Field label="Notes">
            {isEditing ? (
              <textarea
                value={form.notes}
                onChange={set("notes")}
                rows={4}
                placeholder="Add notes…"
                className={inputCls + " resize-none leading-relaxed"}
              />
            ) : item.notes ? (
              <p className="text-[13.5px] text-text-2 leading-relaxed whitespace-pre-wrap">
                {item.notes}
              </p>
            ) : (
              <p className="text-[13.5px] text-text-3 italic">No notes</p>
            )}
          </Field>

          {/* ── Family + Tasks sections (view mode only) ──────────────── */}
          {!isEditing && (
            <>
              {/* ── Family ─────────────────────────────────────────────── */}
              <div className="border-t border-border" />

              {familyLoading ? (
                <p className="text-[12px] text-text-3 italic">Loading family…</p>
              ) : familyInfo ? (
                <>
                  <Field label="Family">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-serif text-[14px] font-medium text-text">
                        {familyInfo.name || "—"}
                      </p>
                      {canEdit && (
                        <Link
                          href={`/families?open=${familyInfo.id}`}
                          className="flex-shrink-0 text-[12px] text-green hover:text-green-deep font-medium transition-colors"
                        >
                          Edit family →
                        </Link>
                      )}
                    </div>
                  </Field>

                  <Field label="Parents">
                    {familyInfo.parents.length === 0 ? (
                      <p className="text-[13px] text-text-3 italic">None on record</p>
                    ) : (
                      <div className="space-y-1">
                        {[...familyInfo.parents]
                          .sort((a, b) => {
                            if (a.primary_contact !== b.primary_contact)
                              return a.primary_contact ? -1 : 1;
                            return `${a.first_name} ${a.last_name}`.localeCompare(
                              `${b.first_name} ${b.last_name}`
                            );
                          })
                          .map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-[13px] text-text-2">
                                {p.first_name} {p.last_name}
                              </span>
                              {p.primary_contact && (
                                <span className="font-mono text-[10px] text-text-3 uppercase tracking-wide">
                                  primary
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </Field>

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
                            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                              <input
                                autoFocus
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")  saveTaskEdit(task.task_id);
                                  if (e.key === "Escape") cancelTaskEdit();
                                }}
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
          )}

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

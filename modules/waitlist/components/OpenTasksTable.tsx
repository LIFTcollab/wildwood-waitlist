"use client";

import { useState, useMemo } from "react";
import { updateTask } from "@/modules/waitlist/lib/actions/tasks";

// ─── Types ──────────────────���─────────────────────────────────────────────────

export type TaskRow = {
  task_id: string;
  task_name: string | null;
  task_description: string | null;
  task_status: string | null;
  child_full_name: string | null;
  term_name: string | null;
};

const TASK_STATUSES = ["To Do", "Doing", "Done"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

// ─── Status pill ──────────���────────────────────────────────���──────────────────

const STATUS_STYLES: Record<TaskStatus, { bg: string; text: string }> = {
  "To Do": { bg: "bg-gray-soft",  text: "text-text-2"    },
  "Doing": { bg: "bg-gold-soft",  text: "text-gold"      },
  "Done":  { bg: "bg-green-soft", text: "text-green-deep" },
};

function TaskStatusPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-text-3">—</span>;
  const s = STATUS_STYLES[value as TaskStatus];
  if (!s) return <span className="text-text-2 text-[12px]">{value}</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${s.bg} ${s.text}`}>
      {value}
    </span>
  );
}

// ─── Shared input styles ─────────────���────────────────────────────────────────

const inputCls =
  "w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[13px] text-text focus:outline-none focus:border-green transition-colors";

const selectCls =
  inputCls + " appearance-none pr-7 cursor-pointer";

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath stroke='%239b9684' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 10px center" as const,
};

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  task,
  onClose,
  onSave,
}: {
  task: TaskRow;
  onClose: () => void;
  onSave: (updated: TaskRow) => void;
}) {
  const [name,        setName]        = useState(task.task_name ?? "");
  const [description, setDescription] = useState(task.task_description ?? "");
  const [status,      setStatus]      = useState(task.task_status ?? "To Do");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateTask(task.task_id, {
      task_name:        name,
      task_description: description || null,
      task_status:      status,
    });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    onSave({ ...task, task_name: name, task_description: description || null, task_status: status });
    setSaving(false);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-text/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-label="Edit task"
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        <div className="bg-surface border border-border rounded-xl shadow-2xl w-[460px] pointer-events-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
            <h2 className="font-serif text-[18px] font-medium text-text">Edit task</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-hover transition-colors"
            >
              <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Context — read-only */}
            <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-warm border border-border rounded-lg">
              <span className="font-serif text-[13.5px] text-text">{task.child_full_name}</span>
              <span className="text-border-strong">·</span>
              <span className="font-mono text-[12px] text-text-3">{task.term_name}</span>
            </div>

            {/* Task name */}
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
                Task name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="Task name"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Add a description…"
                className={inputCls + " resize-none leading-relaxed"}
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={selectCls}
                style={selectStyle}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-[12.5px] text-terra">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
            <button
              onClick={onClose}
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
        </div>
      </div>
    </>
  );
}

// ─── Table ─────────────────���──────────────────────────────────────────────────

const DEFAULT_FILTER: TaskStatus[] = ["To Do", "Doing"];

export function OpenTasksTable({ tasks: initialTasks, canEdit }: { tasks: TaskRow[]; canEdit: boolean }) {
  const [tasks,          setTasks]          = useState<TaskRow[]>(initialTasks);
  const [editing,        setEditing]        = useState<TaskRow | null>(null);
  const [filterStatuses, setFilterStatuses] = useState<TaskStatus[]>(DEFAULT_FILTER);

  function toggleStatus(s: TaskStatus) {
    setFilterStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function handleSave(updated: TaskRow) {
    setTasks((prev) => prev.map((t) => (t.task_id === updated.task_id ? updated : t)));
    setEditing(null);
  }

  const visibleTasks = useMemo(
    () => tasks.filter((t) => filterStatuses.includes((t.task_status ?? "") as TaskStatus)),
    [tasks, filterStatuses]
  );

  return (
    <>
      {/* ── Status filter ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-text-3 mr-1">
          Status
        </span>
        {TASK_STATUSES.map((s) => {
          const active = filterStatuses.includes(s);
          const style  = STATUS_STYLES[s];
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
                active
                  ? `${style.bg} ${style.text} border-transparent`
                  : "bg-surface border-border text-text-3 hover:border-border-strong hover:text-text-2"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* ── Table ──���──────────────────────────���─────────────────────────── */}
      {visibleTasks.length === 0 ? (
        <div className="bg-surface border border-border rounded-[10px] px-5 py-10 text-center text-sm text-text-3">
          No tasks match the selected filters.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
          <table className="w-full text-[13px] border-collapse">
            <colgroup>
              <col className="w-[35%]" />
              <col className="w-[12%]" />
              <col />
              <col className="w-[5%]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-warm border-b border-border text-left">
                <th className="px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
                  Task
                </th>
                <th className="px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
                  Status
                </th>
                <th className="px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
                  Description
                </th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr
                  key={task.task_id}
                  className="border-b border-border last:border-0 hover:bg-surface-warm transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-text align-top">
                    {task.task_name}
                  </td>
                  <td className="px-5 py-3 align-top">
                    <TaskStatusPill value={task.task_status} />
                  </td>
                  <td className="px-5 py-3 text-text-2 text-[12.5px] leading-relaxed align-top">
                    {task.task_description ? (
                      task.task_description
                    ) : (
                      <span className="text-text-3 italic">No description</span>
                    )}
                  </td>
                  <td className="px-5 py-3 align-top text-right">
                    {canEdit && (
                      <button
                        onClick={() => setEditing(task)}
                        className="p-1 rounded text-text-3 hover:text-text hover:bg-surface-hover transition-colors"
                        aria-label={`Edit task: ${task.task_name}`}
                      >
                        <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5">
                          <path
                            d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditModal
          task={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

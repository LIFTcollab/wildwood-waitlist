"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  updateParent,
  addParent,
  deleteParent,
  deleteFamily,
  moveChildToFamily,
  moveParentToFamily,
  createFamily,
  type ParentData,
} from "@/modules/waitlist/lib/actions/families";
import type { FamilyRow } from "./FamiliesTable";
import { PriorityPill } from "./WaitlistTable";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParentDetail = {
  id:              string;
  first_name:      string;
  last_name:       string;
  email:           string | null;
  phone:           string | null;
  primary_contact: boolean;
  school_history:  "Board" | "Teacher" | "Alumni" | null;
};

type ChildWaitlistItem = {
  status:    string | null;
  term_name: string | null;
};

type ChildDetail = {
  id:         string;
  first_name: string;
  last_name:  string;
  items:      ChildWaitlistItem[];
};

type FamilyDetail = {
  id:              string;
  name:            string;
  organization_id: string;
  priority_status: string | null;
  parents:         ParentDetail[];
  children:        ChildDetail[];
};

// ─── Form types ───────────────────────────────────────────────────────────────

type ParentForm = {
  _key:            string;   // stable React key (id for existing, temp for new)
  id:              string | null; // null = new, not yet saved
  first_name:      string;
  last_name:       string;
  email:           string;
  phone:           string;
  primary_contact: boolean;
  school_history:  string;   // "" | "Board" | "Teacher" | "Alumni"
};

type FamilyForm = {
  parents: ParentForm[];
};

// Mirrors the DB trigger: distinct last names, alphabetical, joined with "-"
function computeFamilyName(
  parents: { last_name: string }[],
  fallback: string
): string {
  const names = [...new Set(
    parents.map((p) => p.last_name.trim()).filter(Boolean)
  )].sort();
  return names.length > 0 ? names.join("-") : fallback;
}

// ─── Semantic color maps ──────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Enrolled:   { bg: "bg-green-soft",  text: "text-green-deep" },
  Waitlisted: { bg: "bg-gold-soft",   text: "text-gold"       },
  Declined:   { bg: "bg-terra-soft",  text: "text-terra"      },
  Inactive:   { bg: "bg-gray-soft",   text: "text-text-3"     },
};

// ─── Shared input style ───────────────────────────────────────────────────────

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

// ─── Field label ──────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-1.5">
      {children}
    </div>
  );
}

// ─── Helper: form ↔ detail conversions ───────────────────────────────────────

function parentToForm(p: ParentDetail): ParentForm {
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

function formToParentData(p: ParentForm): ParentData {
  return {
    first_name:      p.first_name.trim(),
    last_name:       p.last_name.trim(),
    email:           p.email.trim() || null,
    phone:           p.phone.trim() || null,
    primary_contact: p.primary_contact,
    school_history:  (p.school_history as "Board" | "Teacher" | "Alumni") || null,
  };
}

let _keyCounter = 0;
function newKey() { return `new-${++_keyCounter}`; }

// ─── Panel ────────────────────────────────────────────────────────────────────

export function FamilyDetailPanel({
  familyId,
  canEdit,
  onClose,
  onUpdate,
  onDelete,
}: {
  familyId:  string | null;
  canEdit:   boolean;
  onClose:   () => void;
  onUpdate:  (id: string, updated: Pick<FamilyRow, "name" | "parents"> & Partial<Pick<FamilyRow, "priority_status" | "priority_rank">>) => void;
  onDelete?: (id: string) => void;
}) {
  const [family,     setFamily]     = useState<FamilyDetail | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [isEditing,  setIsEditing]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);
  const [form,       setForm]       = useState<FamilyForm>({ parents: [] });
  const [confirmKey, setConfirmKey] = useState<string | null>(null); // parent _key pending remove
  const [removeErr,  setRemoveErr]  = useState<string | null>(null);

  // ── Move child / parent shared state ──────────────────────────────────────
  type FamilyOption = { id: string; name: string };
  const [allFamilies,     setAllFamilies]     = useState<FamilyOption[]>([]);
  const [familiesLoaded,  setFamiliesLoaded]  = useState(false);

  // Move child
  const [movingChildId,   setMovingChildId]   = useState<string | null>(null);
  const [familySearch,    setFamilySearch]    = useState("");
  const [moving,          setMoving]          = useState(false);
  const [moveError,       setMoveError]       = useState<string | null>(null);

  // Move parent
  const [movingParentKey,    setMovingParentKey]    = useState<string | null>(null);
  const [parentFamilySearch, setParentFamilySearch] = useState("");
  const [parentMoving,       setParentMoving]       = useState(false);
  const [parentMoveError,    setParentMoveError]    = useState<string | null>(null);
  // Create-new-family sub-mode within the parent move picker
  const [parentNewFamilyMode, setParentNewFamilyMode] = useState(false);
  const [parentNewFamilyName, setParentNewFamilyName] = useState("");
  const [creatingFamily,      setCreatingFamily]      = useState(false);

  // Delete empty family
  const [deletingFamily,    setDeletingFamily]    = useState(false);
  const [deleteFamilyError, setDeleteFamilyError] = useState<string | null>(null);

  // Fetch full family detail whenever the panel opens
  useEffect(() => {
    if (!familyId) { setFamily(null); setIsEditing(false); return; }
    setLoading(true);
    setSaveError(null);
    setIsEditing(false);
    const supabase = createClient();

    (async () => {
      try {
        // Fetch family + parents + children in one round trip
        const { data: fam } = await supabase
          .from("wl_families")
          .select(
            "id, name, organization_id, priority_status, " +
            "parents:wl_parents(id, first_name, last_name, email, phone, primary_contact, school_history), " +
            "children:wl_children(id, first_name, last_name)"
          )
          .eq("id", familyId)
          .single();

        if (!fam) { setLoading(false); return; }

        // Cast to concrete type — Supabase can't infer deeply-nested select shapes
        type FamRaw = {
          id: string; name: string; organization_id: string; priority_status: string | null;
          parents:  ParentDetail[];
          children: { id: string; first_name: string; last_name: string }[];
        };
        const f = fam as unknown as FamRaw;

        // Fetch waitlist items for all children in this family
        const childIds = (f.children ?? []).map((c) => c.id);
        const { data: wlRows } = childIds.length
          ? await supabase
              .from("waitlist_items_view")
              .select("child_id, status, term_name")
              .in("child_id", childIds)
          : { data: [] };

        const itemsByChild: Record<string, ChildWaitlistItem[]> = {};
        for (const row of wlRows ?? []) {
          if (!itemsByChild[row.child_id]) itemsByChild[row.child_id] = [];
          itemsByChild[row.child_id].push({
            status:    row.status,
            term_name: row.term_name,
          });
        }

        const detail: FamilyDetail = {
          id:              f.id,
          name:            f.name,
          organization_id: f.organization_id,
          priority_status: f.priority_status ?? null,
          parents: [...(f.parents ?? [])]
            .sort((a, b) => {
              if (a.primary_contact !== b.primary_contact)
                return a.primary_contact ? -1 : 1;
              return `${a.first_name} ${a.last_name}`.localeCompare(
                `${b.first_name} ${b.last_name}`
              );
            }),
          children: [...(f.children ?? [])]
            .sort((a, b) =>
              `${a.first_name} ${a.last_name}`.localeCompare(
                `${b.first_name} ${b.last_name}`
              )
            )
            .map((c) => ({
              ...c,
              items: itemsByChild[c.id] ?? [],
            })),
        };

        setFamily(detail);
        setForm({
          parents: detail.parents.map(parentToForm),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [familyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!familyId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) { setIsEditing(false); setSaveError(null); }
        else onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [familyId, isEditing, onClose]);

  if (!familyId) return null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setParentField(key: string, field: keyof ParentForm, value: unknown) {
    setForm((prev) => ({
      ...prev,
      parents: prev.parents.map((p) =>
        p._key === key ? { ...p, [field]: value } : p
      ),
    }));
  }

  function addNewParent() {
    const k = newKey();
    setForm((prev) => ({
      ...prev,
      parents: [
        ...prev.parents,
        {
          _key:            k,
          id:              null,
          first_name:      "",
          last_name:       "",
          email:           "",
          phone:           "",
          primary_contact: false,
          school_history:  "",
        },
      ],
    }));
  }

  async function fetchPriority(familyId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("wl_families")
      .select("priority_status, priority_rank")
      .eq("id", familyId)
      .single();
    return {
      priority_status: (data?.priority_status as string | null) ?? null,
      priority_rank:   (data?.priority_rank   as number | null) ?? null,
    };
  }

  async function handleRemoveParent(p: ParentForm) {
    setRemoveErr(null);
    if (p.id === null) {
      // New parent not yet saved — just remove from form
      setForm((prev) => ({
        ...prev,
        parents: prev.parents.filter((fp) => fp._key !== p._key),
      }));
      setConfirmKey(null);
      return;
    }
    const result = await deleteParent(p.id);
    if (result.error) {
      setRemoveErr(result.error);
      setConfirmKey(null);
      return;
    }
    // Capture filtered list now, before the async state update resolves
    const remainingParents = family
      ? family.parents.filter((fp) => fp.id !== p.id)
      : [];

    // Remove from local family + form state
    setFamily((prev) =>
      prev
        ? { ...prev, parents: prev.parents.filter((fp) => fp.id !== p.id) }
        : prev
    );
    setForm((prev) => ({
      ...prev,
      parents: prev.parents.filter((fp) => fp._key !== p._key),
    }));
    setConfirmKey(null);
    // Sync table row — re-fetch priority since removing a parent may change it
    if (family) {
      const priority = await fetchPriority(family.id);
      onUpdate(family.id, {
        name:            computeFamilyName(remainingParents, family.name),
        priority_status: priority.priority_status,
        priority_rank:   priority.priority_rank,
        parents: remainingParents.map((fp) => ({
          id:              fp.id,
          first_name:      fp.first_name,
          last_name:       fp.last_name,
          primary_contact: fp.primary_contact,
        })),
      });
    }
  }

  async function handleDeleteFamily() {
    if (!family) return;
    setDeletingFamily(true);
    setDeleteFamilyError(null);
    const result = await deleteFamily(family.id);
    if (result.error) {
      setDeleteFamilyError(result.error);
      setDeletingFamily(false);
      return;
    }
    onDelete?.(family.id);
    onClose();
  }

  function handleCancel() {
    if (!family) return;
    setForm({ parents: family.parents.map(parentToForm) });
    setIsEditing(false);
    setSaveError(null);
    setConfirmKey(null);
    setMovingChildId(null);
    setFamilySearch("");
    setMoveError(null);
    setMovingParentKey(null);
    setParentFamilySearch("");
    setParentMoveError(null);
    setParentNewFamilyMode(false);
    setParentNewFamilyName("");
    setCreatingFamily(false);
  }

  async function loadFamilies() {
    if (familiesLoaded) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("wl_families")
      .select("id, name")
      .order("name");
    setAllFamilies((data ?? []) as FamilyOption[]);
    setFamiliesLoaded(true);
  }

  async function openMoveChild(childId: string) {
    setMovingChildId(childId);
    setFamilySearch("");
    setMoveError(null);
    await loadFamilies();
  }

  async function openMoveParent(parentKey: string) {
    setMovingParentKey(parentKey);
    setParentFamilySearch("");
    setParentMoveError(null);
    await loadFamilies();
  }

  async function handleMoveParent(targetFamilyId: string, parentKey: string) {
    const parent = form.parents.find((p) => p._key === parentKey);
    if (!parent?.id) return;
    setParentMoving(true);
    setParentMoveError(null);
    const result = await moveParentToFamily(parent.id, targetFamilyId);
    if (result.error) {
      setParentMoveError(result.error);
      setParentMoving(false);
      return;
    }
    // Remove from local family + form state
    const remaining = family
      ? family.parents.filter((fp) => fp.id !== parent.id)
      : [];
    setFamily((prev) =>
      prev ? { ...prev, parents: prev.parents.filter((fp) => fp.id !== parent.id) } : prev
    );
    setForm((prev) => ({
      ...prev,
      parents: prev.parents.filter((fp) => fp._key !== parentKey),
    }));
    setMovingParentKey(null);
    setParentFamilySearch("");
    setParentMoving(false);
    if (family) {
      const priority = await fetchPriority(family.id);
      onUpdate(family.id, {
        name:            computeFamilyName(remaining, family.name),
        priority_status: priority.priority_status,
        priority_rank:   priority.priority_rank,
        parents: remaining.map((fp) => ({
          id:              fp.id,
          first_name:      fp.first_name,
          last_name:       fp.last_name,
          primary_contact: fp.primary_contact,
        })),
      });
    }
  }

  async function handleCreateAndMove(parentKey: string) {
    if (!parentNewFamilyName.trim()) return;
    setCreatingFamily(true);
    setParentMoveError(null);

    // Step 1: create the new family
    const createResult = await createFamily(parentNewFamilyName.trim());
    if (createResult.error) {
      setParentMoveError(createResult.error);
      setCreatingFamily(false);
      return;
    }

    // Add to local list so it shows up in future pickers
    setAllFamilies((prev) =>
      [...prev, { id: createResult.id!, name: parentNewFamilyName.trim() }]
        .sort((a, b) => a.name.localeCompare(b.name))
    );

    // Step 2: move the parent to the new family
    const parent = form.parents.find((p) => p._key === parentKey);
    if (!parent?.id) { setCreatingFamily(false); return; }

    setParentMoving(true);
    const moveResult = await moveParentToFamily(parent.id, createResult.id!);
    if (moveResult.error) {
      setParentMoveError(moveResult.error);
      setParentMoving(false);
      setCreatingFamily(false);
      return;
    }

    // Success — clean up all state
    const remaining = family
      ? family.parents.filter((fp) => fp.id !== parent.id)
      : [];
    setFamily((prev) =>
      prev ? { ...prev, parents: prev.parents.filter((fp) => fp.id !== parent.id) } : prev
    );
    setForm((prev) => ({
      ...prev,
      parents: prev.parents.filter((fp) => fp._key !== parentKey),
    }));
    setMovingParentKey(null);
    setParentFamilySearch("");
    setParentNewFamilyMode(false);
    setParentNewFamilyName("");
    setParentMoving(false);
    setCreatingFamily(false);

    if (family) {
      const priority = await fetchPriority(family.id);
      onUpdate(family.id, {
        name:            computeFamilyName(remaining, family.name),
        priority_status: priority.priority_status,
        priority_rank:   priority.priority_rank,
        parents: remaining.map((fp) => ({
          id:              fp.id,
          first_name:      fp.first_name,
          last_name:       fp.last_name,
          primary_contact: fp.primary_contact,
        })),
      });
    }
  }

  async function handleMoveChild(targetFamilyId: string, childId: string) {
    setMoving(true);
    setMoveError(null);
    const result = await moveChildToFamily(childId, targetFamilyId);
    if (result.error) {
      setMoveError(result.error);
      setMoving(false);
      return;
    }
    // Remove child from local family state
    setFamily((prev) =>
      prev ? { ...prev, children: prev.children.filter((c) => c.id !== childId) } : prev
    );
    setMovingChildId(null);
    setFamilySearch("");
    setMoving(false);
  }

  async function handleSave() {
    if (!family) return;
    setSaving(true);
    setSaveError(null);

    // Update existing parents in parallel — fail fast on any error
    const existing = form.parents.filter((p) => p.id !== null);
    const updateResults = await Promise.all(
      existing.map((p) => updateParent(p.id!, formToParentData(p)))
    );
    const updateError = updateResults.find((r) => r.error);
    if (updateError?.error) {
      setSaveError(updateError.error);
      setSaving(false);
      return;
    }

    // Insert new parents sequentially (need returned ids) — fail fast
    const newParentIds: Record<string, string> = {};
    for (const p of form.parents.filter((fp) => fp.id === null)) {
      const r = await addParent(
        family.id,
        formToParentData(p)
      );
      if (r.error) {
        setSaveError(r.error);
        setSaving(false);
        return;
      }
      if (r.id) newParentIds[p._key] = r.id;
    }

    // Build updated family detail
    const updatedParents: ParentDetail[] = form.parents.map((p) => ({
      id:              p.id ?? newParentIds[p._key] ?? "",
      first_name:      p.first_name.trim(),
      last_name:       p.last_name.trim(),
      email:           p.email.trim() || null,
      phone:           p.phone.trim() || null,
      primary_contact: p.primary_contact,
      school_history:  (p.school_history as "Board" | "Teacher" | "Alumni") || null,
    }));

    const computedName = computeFamilyName(updatedParents, family.name);

    // Re-fetch priority_status / priority_rank — DB trigger may have changed them
    const supabase = createClient();
    const { data: refreshed } = await supabase
      .from("wl_families")
      .select("priority_status, priority_rank")
      .eq("id", family.id)
      .single();

    const updatedFamily: FamilyDetail = {
      ...family,
      name:            computedName,
      parents:         updatedParents,
      priority_status: refreshed?.priority_status ?? family.priority_status,
    };
    setFamily(updatedFamily);
    // Patch form keys with real ids for any newly inserted parents
    setForm({
      parents: updatedParents.map(parentToForm),
    });

    // Sync the families table row — including refreshed priority fields
    onUpdate(family.id, {
      name:            computedName,
      priority_status: refreshed?.priority_status ?? family.priority_status,
      priority_rank:   (refreshed?.priority_rank as number | null | undefined) ?? null,
      parents: updatedParents.map((p) => ({
        id:              p.id,
        first_name:      p.first_name,
        last_name:       p.last_name,
        primary_contact: p.primary_contact,
      })),
    });

    setIsEditing(false);
    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        aria-label={family ? `Details for ${family.name}` : "Family details"}
        className="fixed right-0 top-0 h-full w-[440px] bg-surface border-l border-border z-50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-border flex-shrink-0">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-7 w-40 bg-border rounded animate-pulse" />
            ) : isEditing ? (
              <>
                <h2 className="font-serif text-[22px] font-medium text-text leading-tight truncate">
                  {computeFamilyName(form.parents, family?.name ?? "—")}
                </h2>
                <p className="text-[11px] text-text-3 italic mt-0.5">
                  Name is auto-generated from parent last names
                </p>
              </>
            ) : (
              <>
                <h2 className="font-serif text-[22px] font-medium text-text leading-tight truncate">
                  {family?.name ?? "—"}
                </h2>
                {family?.priority_status && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <PriorityPill value={family.priority_status} />
                    <span className="text-[11px] text-text-3 italic">auto-computed</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
            {canEdit && !isEditing && !loading && (
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-border/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* ── Parents ─────────────────────────────────────────────── */}
              <div>
                <FieldLabel>Parents</FieldLabel>

                {removeErr && (
                  <p className="mb-2 text-[12px] text-terra">{removeErr}</p>
                )}

                <div className="space-y-4">
                  {(isEditing ? form.parents : family?.parents ?? []).length === 0 && (
                    <p className="text-[13px] text-text-3 italic">No parents on record.</p>
                  )}

                  {isEditing
                    ? form.parents.map((p) => (
                        <div key={p._key} className="rounded-xl border border-border p-4 space-y-2.5 bg-surface-warm">
                          {/* Name row */}
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

                          {/* Bottom row: primary contact + school history + move + remove */}
                          <div className="flex items-center gap-3 pt-0.5">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <div
                                className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                                  p.primary_contact
                                    ? "bg-green border-green"
                                    : "border-border-strong bg-surface"
                                }`}
                              >
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
                                onChange={() =>
                                  setParentField(p._key, "primary_contact", !p.primary_contact)
                                }
                              />
                              <span className="text-[12px] text-text-2">Primary contact</span>
                            </label>

                            <select
                              value={p.school_history}
                              onChange={(e) => setParentField(p._key, "school_history", e.target.value)}
                              className="flex-1 px-2.5 py-1.5 bg-surface border border-border rounded-lg text-[12.5px] text-text focus:outline-none focus:border-green transition-colors appearance-none cursor-pointer pr-6"
                              style={selectStyle}
                            >
                              <option value="">No school history</option>
                              <option value="Board">Board</option>
                              <option value="Teacher">Teacher</option>
                              <option value="Alumni">Alumni</option>
                            </select>

                            {/* Move (saved parents only) */}
                            {p.id !== null && confirmKey !== p._key && movingParentKey !== p._key && (
                              <button
                                onClick={() => openMoveParent(p._key)}
                                className="flex-shrink-0 text-[12px] text-text-3 hover:text-text-2 underline underline-offset-2 transition-colors"
                              >
                                Move
                              </button>
                            )}

                            {/* Delete parent / confirm */}
                            {confirmKey === p._key ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[12px] text-terra font-medium">Delete permanently?</span>
                                <button
                                  onClick={() => handleRemoveParent(p)}
                                  className="text-[12px] text-terra font-semibold hover:underline"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmKey(null)}
                                  className="text-[12px] text-text-3 hover:underline"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              movingParentKey !== p._key && (
                                <button
                                  onClick={() => setConfirmKey(p._key)}
                                  className="flex-shrink-0 text-[12px] text-text-3 hover:text-terra transition-colors"
                                >
                                  Delete
                                </button>
                              )
                            )}
                          </div>
                          {/* Inline family picker for parent move */}
                          {movingParentKey === p._key && (
                            <div className="mt-3 rounded-xl border border-border bg-surface-warm p-3 space-y-2">
                              {form.parents.length === 1 && (
                                <p className="text-[11.5px] text-gold font-medium">
                                  ⚠ This is the only parent in this family.
                                </p>
                              )}

                              {parentNewFamilyMode ? (
                                /* ── Create new family sub-mode ── */
                                <>
                                  <p className="text-[11.5px] text-text-3">New family name</p>
                                  <input
                                    autoFocus
                                    type="text"
                                    value={parentNewFamilyName}
                                    onChange={(e) => setParentNewFamilyName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleCreateAndMove(p._key);
                                      if (e.key === "Escape") {
                                        setParentNewFamilyMode(false);
                                        setParentNewFamilyName("");
                                        setParentMoveError(null);
                                      }
                                    }}
                                    placeholder="e.g. Garcia Family"
                                    className={inputCls + " text-[12.5px]"}
                                  />
                                  {parentMoveError && (
                                    <p className="text-[12px] text-terra">{parentMoveError}</p>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleCreateAndMove(p._key)}
                                      disabled={!parentNewFamilyName.trim() || creatingFamily}
                                      className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-white bg-green hover:bg-green-deep transition-colors disabled:opacity-40 disabled:cursor-default"
                                    >
                                      {creatingFamily ? "Creating…" : "Create & move"}
                                    </button>
                                    <button
                                      onClick={() => { setParentNewFamilyMode(false); setParentNewFamilyName(""); setParentMoveError(null); }}
                                      disabled={creatingFamily}
                                      className="text-[12px] text-text-3 hover:text-text transition-colors disabled:opacity-50"
                                    >
                                      ← Back
                                    </button>
                                  </div>
                                </>
                              ) : (
                                /* ── Search existing families ── */
                                <>
                                  <p className="text-[11.5px] text-text-3">Move to which family?</p>
                                  <div className="relative">
                                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none" viewBox="0 0 16 16" fill="none">
                                      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                                      <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                    <input
                                      autoFocus
                                      type="text"
                                      placeholder="Search families…"
                                      value={parentFamilySearch}
                                      onChange={(e) => setParentFamilySearch(e.target.value)}
                                      className={inputCls + " pl-8 text-[12.5px]"}
                                    />
                                  </div>
                                  <div className="max-h-[180px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                                    {allFamilies
                                      .filter(
                                        (f) =>
                                          f.id !== family?.id &&
                                          (!parentFamilySearch.trim() ||
                                            f.name.toLowerCase().includes(parentFamilySearch.toLowerCase()))
                                      )
                                      .map((f) => (
                                        <button
                                          key={f.id}
                                          onClick={() => handleMoveParent(f.id, p._key)}
                                          disabled={parentMoving}
                                          className="w-full text-left px-3 py-2 text-[13px] text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
                                        >
                                          {f.name}
                                        </button>
                                      ))}
                                    {allFamilies.filter(
                                      (f) =>
                                        f.id !== family?.id &&
                                        (!parentFamilySearch.trim() ||
                                          f.name.toLowerCase().includes(parentFamilySearch.toLowerCase()))
                                    ).length === 0 && (
                                      <p className="px-3 py-2 text-[12.5px] text-text-3 italic">
                                        {familiesLoaded ? "No other families." : "Loading…"}
                                      </p>
                                    )}
                                  </div>
                                  {parentMoveError && (
                                    <p className="text-[12px] text-terra">{parentMoveError}</p>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={() => { setParentNewFamilyMode(true); setParentFamilySearch(""); setParentMoveError(null); }}
                                      className="flex items-center gap-1 text-[12px] text-green hover:text-green-deep font-medium transition-colors"
                                    >
                                      <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                                        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                                      </svg>
                                      New family
                                    </button>
                                    <button
                                      onClick={() => { setMovingParentKey(null); setParentFamilySearch(""); setParentMoveError(null); }}
                                      className="text-[12px] text-text-3 hover:text-text transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    : family?.parents.map((p) => (
                        <div key={p.id} className="space-y-1">
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

                {/* Add parent button (edit mode only) */}
                {isEditing && (
                  <button
                    onClick={addNewParent}
                    className="mt-3 flex items-center gap-1.5 text-[12.5px] text-green hover:text-green-deep font-medium transition-colors"
                  >
                    <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                    Add parent
                  </button>
                )}
              </div>

              {/* ── No-parents banner (view mode only) ──────────────────── */}
              {!isEditing && !loading && family && family.parents.length === 0 && (
                <div className="rounded-xl border border-terra/30 bg-terra-soft/40 p-4 space-y-2">
                  <p className="text-[13px] font-medium text-terra">This family has no parents.</p>
                  {family.children.length > 0 ? (
                    <p className="text-[12.5px] text-text-2">
                      Move or remove the {family.children.length === 1 ? "child" : `${family.children.length} children`} before this family can be deleted.
                    </p>
                  ) : canEdit ? (
                    <>
                      <p className="text-[12.5px] text-text-2">
                        No children either. You can delete this empty family.
                      </p>
                      {deleteFamilyError && (
                        <p className="text-[12px] text-terra">{deleteFamilyError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDeleteFamily}
                          disabled={deletingFamily}
                          className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-white bg-terra hover:opacity-80 transition-opacity disabled:opacity-50"
                        >
                          {deletingFamily ? "Deleting…" : "Delete family"}
                        </button>
                        <button
                          onClick={onClose}
                          disabled={deletingFamily}
                          className="text-[12px] text-text-3 hover:text-text transition-colors disabled:opacity-50"
                        >
                          Keep it
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {/* ── Children ─────────────────────────────────────────────── */}
              <div className="border-t border-border pt-5">
                <FieldLabel>Children</FieldLabel>

                {(family?.children ?? []).length === 0 ? (
                  <p className="text-[13px] text-text-3 italic">No children linked to this family.</p>
                ) : (
                  <div className="space-y-4">
                    {(family?.children ?? []).map((child) => (
                      <div key={child.id}>
                        {/* Name row + Move button */}
                        <div className="flex items-center gap-2">
                          <p className="font-serif text-[14px] font-medium text-text">
                            {child.first_name} {child.last_name}
                          </p>
                          {isEditing && canEdit && movingChildId !== child.id && (
                            <button
                              onClick={() => openMoveChild(child.id)}
                              className="text-[11px] text-text-3 hover:text-text-2 underline underline-offset-2 transition-colors"
                            >
                              Move
                            </button>
                          )}
                        </div>

                        {/* Status pills */}
                        {child.items.length === 0 ? (
                          <p className="text-[12px] text-text-3 italic mt-0.5">No waitlist entries</p>
                        ) : (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {child.items.map((item, idx) => {
                              const s = item.status ?? "";
                              const style = STATUS_STYLES[s] ?? { bg: "bg-gray-soft", text: "text-text-3" };
                              return (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium ${style.bg} ${style.text}`}
                                >
                                  {s}
                                  {item.term_name && (
                                    <span className="opacity-70">· {item.term_name}</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Inline family picker — shown when Move is clicked */}
                        {movingChildId === child.id && (
                          <div className="mt-2 rounded-xl border border-border bg-surface-warm p-3 space-y-2">
                            <p className="text-[11.5px] text-text-3">Move to which family?</p>

                            {/* Search */}
                            <div className="relative">
                              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-3 pointer-events-none" viewBox="0 0 16 16" fill="none">
                                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
                                <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              <input
                                autoFocus
                                type="text"
                                placeholder="Search families…"
                                value={familySearch}
                                onChange={(e) => setFamilySearch(e.target.value)}
                                className={inputCls + " pl-8 text-[12.5px]"}
                              />
                            </div>

                            {/* Family list */}
                            <div className="max-h-[180px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                              {allFamilies
                                .filter(
                                  (f) =>
                                    f.id !== family?.id &&
                                    (!familySearch.trim() ||
                                      f.name.toLowerCase().includes(familySearch.toLowerCase()))
                                )
                                .map((f) => (
                                  <button
                                    key={f.id}
                                    onClick={() => handleMoveChild(f.id, child.id)}
                                    disabled={moving}
                                    className="w-full text-left px-3 py-2 text-[13px] text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
                                  >
                                    {f.name}
                                  </button>
                                ))}
                              {allFamilies.filter(
                                (f) =>
                                  f.id !== family?.id &&
                                  (!familySearch.trim() ||
                                    f.name.toLowerCase().includes(familySearch.toLowerCase()))
                              ).length === 0 && (
                                <p className="px-3 py-2 text-[12.5px] text-text-3 italic">
                                  {familiesLoaded ? "No families found." : "Loading…"}
                                </p>
                              )}
                            </div>

                            {/* Error + cancel */}
                            {moveError && (
                              <p className="text-[12px] text-terra">{moveError}</p>
                            )}
                            <button
                              onClick={() => { setMovingChildId(null); setFamilySearch(""); setMoveError(null); }}
                              className="text-[12px] text-text-3 hover:text-text transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save error */}
              {saveError && (
                <p className="text-[12.5px] text-terra leading-snug">{saveError}</p>
              )}
            </>
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

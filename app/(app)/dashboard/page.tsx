import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TermChartGrid } from "@/modules/waitlist/components/TermChartGrid";
import type { TermChartData } from "@/modules/waitlist/components/TermChartGrid";
import { OpenTasksTable } from "@/modules/waitlist/components/OpenTasksTable";
import type { TaskRow } from "@/modules/waitlist/components/OpenTasksTable";

// ─── Types ───────────────────────────────────────────────────────────────────

type TermRow = {
  id: string;
  name: string;
  sort_order: number | null;
  status: string | null;
};

type TermStats = {
  total: number;
  enrolled: number;
  waitlisted: number;
  declined: number;
  inactive: number;
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const canEdit = ["Admin", "Director"].includes(profile?.role ?? "");

  const [
    { data: terms },
    { data: waitlistItems },
    { count: openTaskCount },
    { data: taskRows },
  ] = await Promise.all([
    supabase
      .from("wl_school_terms")
      .select("id, name, sort_order, status")
      .order("sort_order", { ascending: true }),
    supabase.from("wl_waitlist_items").select("term_id, status"),
    supabase
      .from("wl_tasks")
      .select("*", { count: "exact", head: true })
      .neq("status", "Done"),
    supabase
      .from("waitlist_tasks_view")
      .select(
        "task_id, task_name, task_description, task_status, child_full_name, term_name, child_priority_status, priority_rank"
      )
      .order("priority_rank", { ascending: true, nullsFirst: false })
      .order("task_name", { ascending: true })
      .limit(50),
  ]);

  // Build per-term stats map
  const termStatsMap: Record<string, TermStats> = {};
  for (const item of waitlistItems ?? []) {
    if (!item.term_id) continue;
    if (!termStatsMap[item.term_id]) {
      termStatsMap[item.term_id] = { total: 0, enrolled: 0, waitlisted: 0, declined: 0, inactive: 0 };
    }
    termStatsMap[item.term_id].total++;
    if (item.status === "Enrolled")   termStatsMap[item.term_id].enrolled++;
    if (item.status === "Waitlisted") termStatsMap[item.term_id].waitlisted++;
    if (item.status === "Declined")   termStatsMap[item.term_id].declined++;
    if (item.status === "Inactive")   termStatsMap[item.term_id].inactive++;
  }

  const open = openTaskCount ?? 0;

  // Split terms and build chart data arrays
  const emptyStats: TermStats = { total: 0, enrolled: 0, waitlisted: 0, declined: 0, inactive: 0 };

  function toChartData(list: TermRow[]): TermChartData[] {
    return list.map((t) => ({
      id:     t.id,
      name:   t.name,
      status: t.status,
      stats:  termStatsMap[t.id] ?? emptyStats,
    }));
  }

  const openTermCharts   = toChartData((terms ?? []).filter((t) => t.status === "Open"));
  const closedTermCharts = toChartData((terms ?? []).filter((t) => t.status === "Closed"));

  return (
    <div>
      {/* Content */}
      <div className="px-7 py-6 max-w-[1500px]">
        {/* Heading */}
        <div className="mb-7">
          <h1 className="font-serif text-[28px] font-medium tracking-tight text-text leading-snug">
            Waitlists by School Term
          </h1>
        </div>

        {/* Open terms */}
        {openTermCharts.length > 0 && (
          <div className="mb-10">
            <SectionDivider label="Open Terms" accent="green" />
            <TermChartGrid terms={openTermCharts} />
          </div>
        )}

        {/* Closed terms */}
        {closedTermCharts.length > 0 && (
          <div className="mb-10">
            <SectionDivider label="Closed Terms" accent="muted" />
            <TermChartGrid terms={closedTermCharts} />
          </div>
        )}

        {/* Open tasks */}
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-[19px] font-medium text-text">Open tasks</h2>
          <span className="font-mono text-[12px] text-text-3">{open} remaining</span>
        </div>
        <OpenTasksTable tasks={(taskRows ?? []) as TaskRow[]} canEdit={canEdit} />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionDivider({ label, accent }: { label: string; accent: "green" | "muted" }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span
        className={`text-[10.5px] font-semibold uppercase tracking-[0.09em] whitespace-nowrap ${
          accent === "green" ? "text-green" : "text-text-3"
        }`}
      >
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TermChartGrid } from "@/components/dashboard/TermChartGrid";
import type { TermChartData } from "@/components/dashboard/TermChartGrid";
import { OpenTasksTable } from "@/components/dashboard/OpenTasksTable";
import type { TaskRow } from "@/components/dashboard/OpenTasksTable";

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

  const [
    { data: terms },
    { data: waitlistItems },
    { count: openTaskCount },
    { count: urgentTaskCount },
    { count: activeFamilies },
    { data: taskRows },
  ] = await Promise.all([
    supabase
      .from("school_terms")
      .select("id, name, sort_order, status")
      .order("sort_order", { ascending: true }),
    supabase.from("waitlist_items").select("term_id, status"),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .neq("status", "Done"),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("priority", "Urgent")
      .neq("status", "Done"),
    supabase.from("families").select("*", { count: "exact", head: true }),
    supabase
      .from("waitlist_tasks_view")
      .select(
        "task_id, task_name, task_description, task_status, child_full_name, term_name, child_priority_status, priority_rank"
      )
      .neq("task_status", "Done")
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

  // Global totals
  const totalWaitlist  = (waitlistItems ?? []).length;
  const totalEnrolled  = Object.values(termStatsMap).reduce((s, t) => s + t.enrolled, 0);
  const open           = openTaskCount ?? 0;
  const urgent         = urgentTaskCount ?? 0;
  const families       = activeFamilies ?? 0;

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
      {/* Topbar */}
      <div className="h-[52px] px-7 bg-bg border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-text-2">
          <span>Wildwood</span>
          <span className="text-text-3">/</span>
          <span className="text-text font-medium">Dashboard</span>
        </div>
        <div className="flex gap-1.5 items-center">
          <button className="inline-flex items-center px-3 py-1.5 text-[12.5px] font-medium border border-border-strong rounded-md bg-surface hover:bg-surface-warm transition-colors text-text">
            Export
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium bg-green text-white rounded-md hover:bg-green-deep transition-colors">
            + Add child
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-7 py-6 max-w-[1500px]">
        {/* Heading */}
        <div className="mb-7">
          <h1 className="font-serif text-[28px] font-medium tracking-tight text-text leading-snug">
            Waitlists by School Term
          </h1>
          <p className="mt-1.5 font-mono text-[13px] text-text-2">
            {open} open task{open !== 1 ? "s" : ""}
            {urgent > 0 ? ` · ${urgent} urgent` : ""}
          </p>
        </div>

        {/* Global stat cards */}
        <div className="grid grid-cols-4 gap-3 mb-10">
          <StatCard
            label="On waitlist"
            value={totalWaitlist}
            sub="across all terms"
            sparkline="green"
          />
          <StatCard
            label="Enrolled"
            value={totalEnrolled}
            sub="all active terms"
            sparkline="gold"
          />
          <StatCard
            label="Open tasks"
            value={open}
            sub={urgent > 0 ? `${urgent} urgent` : "none urgent"}
            sparkline="terra"
            subHighlight={urgent > 0}
          />
          <StatCard
            label="Active families"
            value={families}
            sub="all time"
            sparkline="blue"
          />
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
        <OpenTasksTable tasks={(taskRows ?? []) as TaskRow[]} />
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



type SparkVariant = "green" | "gold" | "terra" | "blue";

const SPARK_HEIGHTS = [30, 42, 38, 55, 50, 68, 82, 100];
const SPARK_COLORS: Record<SparkVariant, { soft: string; full: string }> = {
  green: { soft: "var(--green-soft)", full: "var(--green)" },
  gold:  { soft: "var(--gold-soft)",  full: "var(--gold)"  },
  terra: { soft: "var(--terra-soft)", full: "var(--terra)" },
  blue:  { soft: "var(--blue-soft)",  full: "var(--blue)"  },
};

function Sparkline({ variant }: { variant: SparkVariant }) {
  const { soft, full } = SPARK_COLORS[variant];
  return (
    <div className="flex items-end gap-0.5 h-6">
      {SPARK_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px]"
          style={{ height: `${h}%`, minHeight: 3, background: i >= 6 ? full : soft }}
        />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  sparkline,
  subHighlight = false,
}: {
  label: string;
  value: number;
  sub: string;
  sparkline: SparkVariant;
  subHighlight?: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-[18px] hover:border-border-strong hover:-translate-y-px transition-all">
      <div className="mb-2.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-text-2">
          {label}
        </span>
      </div>
      <div className="font-serif text-[38px] font-medium tracking-tight leading-none text-text mb-2.5 tabular-nums">
        {value}
      </div>
      <Sparkline variant={sparkline} />
      <div
        className={`mt-2 font-mono text-[11.5px] ${
          subHighlight ? "text-terra" : "text-text-3"
        }`}
      >
        {sub}
      </div>
    </div>
  );
}

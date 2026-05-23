import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardCharts from "@/components/dashboard/DashboardCharts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const ONES = [
  "zero","one","two","three","four","five","six","seven","eight","nine",
  "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen",
  "seventeen","eighteen","nineteen",
];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

function toWords(n: number): string {
  if (n < 20) return ONES[n] ?? n.toString();
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o ? `${t} ${ONES[o]}` : t;
  }
  if (n < 1000) {
    const h = ONES[Math.floor(n / 100)];
    const r = n % 100;
    return r ? `${h} hundred ${toWords(r)}` : `${h} hundred`;
  }
  return n.toLocaleString();
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function agg(rows: any[] | null, key: string): Record<string, number> {
  return (rows ?? []).reduce(
    (acc: Record<string, number>, row) => {
      const val = row[key];
      if (val != null) acc[val as string] = (acc[val as string] ?? 0) + 1;
      return acc;
    },
    {}
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { count: totalWaitlist },
    { data: statusRows },
    { data: termRows },
    { data: priorityRows },
    { data: classroomRows },
    { data: recentRows },
    { count: openTasks },
    { count: urgentTasks },
    { count: activeFamilies },
  ] = await Promise.all([
    supabase.from("waitlist_items").select("*", { count: "exact", head: true }),
    supabase
      .from("waitlist_items")
      .select("status")
      .not("status", "is", null),
    supabase.from("waitlist_items_view").select("term_name"),
    supabase.from("waitlist_items_view").select("priority_status"),
    supabase
      .from("waitlist_items")
      .select("classroom")
      .not("classroom", "is", null),
    supabase
      .from("waitlist_items_view")
      .select("id, child_full_name, term_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
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
  ]);

  // Aggregate
  const statusCounts    = agg(statusRows,    "status");
  const termCounts      = agg(termRows,      "term_name");
  const priorityCounts  = agg(priorityRows,  "priority_status");
  const classroomCounts = agg(classroomRows, "classroom");

  const total    = totalWaitlist ?? 0;
  const enrolled = statusCounts["Enrolled"] ?? 0;
  const open     = openTasks ?? 0;
  const urgent   = urgentTasks ?? 0;
  const families = activeFamilies ?? 0;

  // Chart data
  const statusChartData = [
    { name: "Enrolled",   value: statusCounts["Enrolled"]   ?? 0, color: "#4a7c59" },
    { name: "Waitlisted", value: statusCounts["Waitlisted"] ?? 0, color: "#c19b3a" },
    { name: "Declined",   value: statusCounts["Declined"]   ?? 0, color: "#c87856" },
    { name: "Inactive",   value: statusCounts["Inactive"]   ?? 0, color: "#9b9684" },
  ].filter((d) => d.value > 0);

  const TERM_ORDER = ["Fall 25-26","Fall 26-27","Fall 27-28","Fall 28-29","Fall 29-30"];
  const termChartData = TERM_ORDER
    .filter((t) => termCounts[t] !== undefined)
    .map((t) => ({ name: t, value: termCounts[t] }));

  const PRIORITY_ORDER = ["Board","Teacher","Alumni","Sibling","Regular"];
  const priorityChartData = PRIORITY_ORDER
    .filter((p) => priorityCounts[p] !== undefined)
    .map((p) => ({ name: p, value: priorityCounts[p] }));

  const classroomChartData = [
    { name: "Younger Dome", value: classroomCounts["Younger Dome"] ?? 0, color: "#5a7a99" },
    { name: "Older Dome",   value: classroomCounts["Older Dome"]   ?? 0, color: "#c19b3a" },
  ].filter((d) => d.value > 0);

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
        {/* Hero */}
        <div className="mb-7">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-text-3 mb-2">
            A view of the waitlist this morning
          </p>
          <h1 className="font-serif text-[30px] font-medium tracking-tight text-text leading-snug">
            {capitalize(toWords(total))} <em>children</em> are waiting.
          </h1>
          <p className="mt-2 font-serif italic text-[14px] text-text-2">
            {open} open task{open !== 1 ? "s" : ""}
            {urgent > 0 ? ` · ${urgent} marked urgent` : ""}.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <StatCard
            label="On waitlist"
            value={total}
            sub="across all terms"
            sparkline="green"
          />
          <StatCard
            label="Enrolled"
            value={enrolled}
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

        {/* Charts */}
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-[19px] font-medium text-text">
            Waitlist breakdown
          </h2>
        </div>
        <div className="mb-8">
          <DashboardCharts
            statusData={statusChartData}
            termData={termChartData}
            priorityData={priorityChartData}
            classroomData={classroomChartData}
          />
        </div>

        {/* Recent activity */}
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-[19px] font-medium text-text">
            Recent additions
          </h2>
          <span className="font-mono text-[12px] text-text-3">last 5</span>
        </div>
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
          {recentRows && recentRows.length > 0 ? (
            recentRows.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-b-0 hover:bg-surface-warm transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-serif text-[15px] font-medium text-text">
                    {item.child_full_name as string}
                  </span>
                  {item.term_name && (
                    <span className="ml-2.5 font-mono text-[11px] text-text-3">
                      {item.term_name as string}
                    </span>
                  )}
                </div>
                {item.status && (
                  <StatusDot status={item.status as string} />
                )}
                <span className="font-mono text-[11px] text-text-3 flex-shrink-0">
                  {formatDate(item.created_at as string)}
                </span>
              </div>
            ))
          ) : (
            <div className="px-5 py-10 text-center text-sm text-text-3">
              No waitlist items yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

const STATUS_COLORS: Record<string, string> = {
  Waitlisted: "#c19b3a",
  Enrolled:   "#4a7c59",
  Declined:   "#c87856",
  Inactive:   "#9b9684",
};

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#9b9684";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] font-medium flex-shrink-0"
      style={{ color }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      {status}
    </span>
  );
}

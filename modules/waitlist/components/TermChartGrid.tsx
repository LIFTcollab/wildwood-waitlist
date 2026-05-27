"use client";

import dynamic from "next/dynamic";

export type TermChartData = {
  id: string;
  name: string;
  status: string | null;
  stats: {
    total: number;
    enrolled: number;
    waitlisted: number;
    declined: number;
    inactive: number;
  };
};

function ChartSkeleton() {
  return <div className="h-[160px] bg-surface-warm rounded-lg animate-pulse" />;
}

const TermStatusDonut = dynamic(
  () => import("./Charts").then((m) => m.TermStatusDonut),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const LEGEND = [
  { label: "Enrolled",   key: "enrolled"   as const, color: "#4a7c59" },
  { label: "Waitlisted", key: "waitlisted" as const, color: "#c19b3a" },
  { label: "Declined",   key: "declined"   as const, color: "#c87856" },
  { label: "Inactive",   key: "inactive"   as const, color: "#9b9684" },
];

export function TermChartGrid({ terms }: { terms: TermChartData[] }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {terms.map((term) => {
        const isOpen = term.status === "Open";
        const chartData = LEGEND
          .filter((l) => term.stats[l.key] > 0)
          .map((l) => ({ name: l.label, value: term.stats[l.key], color: l.color }));

        return (
          <div
            key={term.id}
            className="bg-surface border border-border rounded-[10px] p-5 hover:border-border-strong transition-colors"
          >
            {/* Card header */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-serif text-[15px] font-medium text-text leading-tight">
                {term.name}
              </h3>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  isOpen
                    ? "bg-green-soft text-green-deep"
                    : "bg-gray-soft text-text-3"
                }`}
              >
                {isOpen ? "Open" : "Closed"}
              </span>
            </div>

            {/* Donut chart */}
            <TermStatusDonut data={chartData} total={term.stats.total} />

            {/* Legend */}
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {LEGEND.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: l.color }}
                  />
                  <span className="font-mono text-[11px] text-text">
                    {term.stats[l.key]}
                  </span>
                  <span className="font-mono text-[11px] text-text-3 truncate">
                    {l.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

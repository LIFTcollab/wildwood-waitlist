"use client";

import dynamic from "next/dynamic";

type NameValue = { name: string; value: number };
type NameValueColor = NameValue & { color: string };

export type DashboardChartsProps = {
  statusData: NameValueColor[];
  termData: NameValue[];
  priorityData: NameValue[];
  classroomData: NameValueColor[];
};

function ChartSkeleton() {
  return <div className="h-48 bg-surface-warm rounded-lg animate-pulse" />;
}

const StatusDonut = dynamic(
  () => import("./Charts").then((m) => m.StatusDonut),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const TermBar = dynamic(
  () => import("./Charts").then((m) => m.TermBar),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const PriorityBar = dynamic(
  () => import("./Charts").then((m) => m.PriorityBar),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const ClassroomDonut = dynamic(
  () => import("./Charts").then((m) => m.ClassroomDonut),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export default function DashboardCharts({
  statusData,
  termData,
  priorityData,
  classroomData,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <ChartCard title="By status">
        <StatusDonut data={statusData} />
      </ChartCard>
      <ChartCard title="By term">
        <TermBar data={termData} />
      </ChartCard>
      <ChartCard title="Priority distribution">
        <PriorityBar data={priorityData} />
      </ChartCard>
      <ChartCard title="By classroom">
        <ClassroomDonut data={classroomData} />
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-2 mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

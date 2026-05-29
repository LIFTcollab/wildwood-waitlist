"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type NameValue = { name: string; value: number };
type NameValueColor = NameValue & { color: string };

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string }[];
};

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const name = label || payload[0].name;
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-1.5 shadow-sm">
      <span className="font-mono text-xs text-text">
        {name}: {payload[0].value}
      </span>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-48 flex items-center justify-center text-sm text-text-3">
      No data yet
    </div>
  );
}

export function StatusDonut({ data }: { data: NameValueColor[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={85}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TermBar({ data }: { data: NameValue[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 28 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
          axisLine={false}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <Bar dataKey="value" fill="#4a7c59" radius={[3, 3, 0, 0]} maxBarSize={40} />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PriorityBar({ data }: { data: NameValue[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
      >
        <XAxis
          type="number"
          tick={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fontFamily: "var(--font-inter)" }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Bar dataKey="value" fill="#c19b3a" radius={[0, 3, 3, 0]} maxBarSize={20} />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TermStatusDonut({ data, total }: { data: NameValueColor[]; total: number }) {
  if (!data.length || total === 0) {
    return (
      <div className="h-[160px] flex items-center justify-center text-sm text-text-3">
        No entries
      </div>
    );
  }
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={46}
            outerRadius={66}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="font-serif text-[22px] font-medium text-text leading-none">{total}</div>
          <div className="font-mono text-[9px] text-text-3 mt-0.5 uppercase tracking-[0.06em]">total</div>
        </div>
      </div>
    </div>
  );
}

export function ClassroomDonut({ data }: { data: NameValueColor[] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={85}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

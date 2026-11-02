"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { TooltipRow } from "@/components/charts/tooltip-row";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { fmt } from "@/lib/labels";

const config = { share: { label: "Share of gain", color: "var(--chart-1)" } } satisfies ChartConfig;

export function ImportanceChart({ data }: { data: { name: string; share: number }[] }) {
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: Math.max(220, data.length * 30) }}
    >
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} unit="%" />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={150} interval={0} tick={{ fontSize: 11 }} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <TooltipRow color="var(--color-share)" label="Share of gain" value={`${fmt(Number(value), 1)}%`} />
              )}
            />
          }
        />
        <Bar dataKey="share" fill="var(--color-share)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

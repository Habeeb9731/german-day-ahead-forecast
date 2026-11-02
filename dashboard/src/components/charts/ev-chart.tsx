"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { TooltipRow } from "@/components/charts/tooltip-row";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { fmt } from "@/lib/labels";

const config = {
  charging: { label: "Charging", color: "var(--chart-1)" },
  idle: { label: "Not charging", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export interface EvBar {
  label: string;
  charging: number | null;
  idle: number | null;
}

export function EvChart({ data }: { data: EvBar[] }) {
  const hasNegative = data.some((d) => (d.charging ?? d.idle ?? 0) < 0);
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={40} />
        {hasNegative && <ReferenceLine y={0} stroke="var(--muted-foreground)" />}
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <TooltipRow
                  color={`var(--color-${name})`}
                  label={config[name as keyof typeof config]?.label}
                  value={`${fmt(Number(value))} ct/kWh`}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
        <Bar dataKey="idle" stackId="price" fill="var(--color-idle)" fillOpacity={0.35} radius={2} isAnimationActive={false} />
        <Bar dataKey="charging" stackId="price" fill="var(--color-charging)" radius={2} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

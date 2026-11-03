"use client";

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TooltipRow } from "@/components/charts/tooltip-row";
import { fmt } from "@/lib/labels";

export interface ComparisonRow {
  name: string;
  value: number;
  color: string;
}

/** Horizontal bars with the value printed on each one, so no axis is needed. */
export function ComparisonBars({ data, unit = "EUR/MWh" }: { data: ComparisonRow[]; unit?: string }) {
  const config = { value: { label: "MAE", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="entrance-reveal-x aspect-auto w-full" style={{ height: data.length * 44 }}>
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 48, top: 0, bottom: 0 }}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis type="category" dataKey="name" hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <TooltipRow color={item.payload.color} label={item.payload.name} value={`${fmt(Number(value))} ${unit}`} />
              )}
            />
          }
        />
        <Bar dataKey="value" radius={8} barSize={26} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v) => fmt(Number(v))}
            className="fill-foreground text-xs tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

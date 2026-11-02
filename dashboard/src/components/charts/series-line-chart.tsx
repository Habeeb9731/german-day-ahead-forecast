"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

/** Line chart with one shared axis. Colours follow the entity, and dashes also separate baselines
 * from the model so identity never depends on colour alone. */
export function SeriesLineChart({
  data,
  xKey,
  series,
  tickFormatter,
  minTickGap = 32,
  unit,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: LineSeries[];
  tickFormatter?: (value: string) => string;
  minTickGap?: number;
  unit: string;
}) {
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          minTickGap={minTickGap}
          tickMargin={8}
          tickFormatter={tickFormatter}
        />
        <YAxis tickLine={false} axisLine={false} width={44} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => (tickFormatter ? tickFormatter(String(value)) : String(value))}
              formatter={(value, name) => (
                <TooltipRow
                  color={`var(--color-${name})`}
                  label={config[String(name)]?.label}
                  value={`${fmt(Number(value))} ${unit}`}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

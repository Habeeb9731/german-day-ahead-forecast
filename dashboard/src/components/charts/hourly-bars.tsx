"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { BarGrow } from "@/components/charts/bar-grow";
import { TooltipRow } from "@/components/charts/tooltip-row";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { highlightBlock } from "@/lib/dashboard";
import { fmt } from "@/lib/labels";
import { hourLabel } from "@/lib/time";
import type { ForecastHour } from "@/lib/types";
import { t } from "@/lib/i18n";

export function HourlyBars({
  hours,
  blockStartUtc,
  blockHours,
}: {
  hours: ForecastHour[];
  blockStartUtc?: string;
  blockHours: number;
}) {
  const config = {
    price: { label: t("Forecast (P50)"), color: "var(--bar)" },
    cheapest: { label: t("Cheapest {n} hours", { n: blockHours }), color: "var(--accent)" },
  } satisfies ChartConfig;
  const isDstDay = hours.length !== 24;
  const data = highlightBlock(hours, blockStartUtc, blockHours).map((row) => ({
    ...row,
    label: hourLabel(row.valid_from_utc, isDstDay),
  }));
  const hasNegative = hours.some((h) => h.p50 < 0);
  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full">
      <BarChart accessibilityLayer data={data} barCategoryGap="16%" margin={{ left: 0, right: 0, top: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tickMargin={6} />
        <YAxis tickLine={false} axisLine={false} width={36} />
        {hasNegative && <ReferenceLine y={0} stroke="var(--muted-foreground)" />}
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="grid w-full gap-1">
                  <TooltipRow
                    color={`var(--color-${name})`}
                    label={config[name as keyof typeof config]?.label}
                    value={`${fmt(Number(value))} EUR/MWh`}
                  />
                  <TooltipRow
                    color="transparent"
                    label="P10–P90"
                    value={t("{low} to {high}", { low: fmt(item.payload.p10), high: fmt(item.payload.p90) })}
                  />
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
        <Bar dataKey="price" stackId="p" fill="var(--color-price)" shape={<BarGrow />} isAnimationActive={false} />
        <Bar dataKey="cheapest" stackId="p" fill="var(--color-cheapest)" shape={<BarGrow />} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

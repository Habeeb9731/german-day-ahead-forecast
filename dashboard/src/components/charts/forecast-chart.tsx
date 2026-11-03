"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";

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
import { hourLabel } from "@/lib/time";
import type { ForecastHour } from "@/lib/types";
import { t } from "@/lib/i18n";

export function ForecastChart({ hours }: { hours: ForecastHour[] }) {
  const config = {
    band: { label: t("P10–P90 range"), color: "var(--accent)" },
    p50: { label: t("Forecast (P50)"), color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const isDstDay = hours.length !== 24;
  const data = hours.map((h) => ({
    label: hourLabel(h.valid_from_utc, isDstDay),
    p50: h.p50,
    band: [h.p10, h.p90],
  }));
  const hasNegative = hours.some((h) => h.p10 < 0);
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full sm:h-80">
      <ComposedChart accessibilityLayer data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={32} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={44} />
        {hasNegative && <ReferenceLine y={0} stroke="var(--muted-foreground)" />}
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) =>
                name === "band" && Array.isArray(value) ? (
                  <TooltipRow
                    color="var(--color-band)"
                    label="P10–P90"
                    value={t("{low} to {high}", { low: fmt(Number(value[0])), high: fmt(Number(value[1])) })}
                  />
                ) : (
                  <TooltipRow color="var(--color-p50)" label={t("Forecast (P50)")} value={fmt(Number(value))} />
                )
              }
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
        <Area
          dataKey="band"
          type="step"
          fill="var(--color-band)"
          className="[&_path]:[fill-opacity:0.18] dark:[&_path]:[fill-opacity:0.28]"
          stroke="none"
          isAnimationActive={false}
        />
        <Line
          dataKey="p50"
          type="step"
          stroke="var(--color-p50)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

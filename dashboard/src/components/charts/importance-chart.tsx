"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { TooltipRow } from "@/components/charts/tooltip-row";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { pct } from "@/lib/labels";
import { t } from "@/lib/i18n";

export function ImportanceChart({ data }: { data: { name: string; share: number }[] }) {
  const config = { share: { label: t("Share of gain"), color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="entrance-reveal-x aspect-auto w-full"
      style={{ height: Math.max(220, data.length * 34) + 24 }}
    >
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => pct(v, 0)} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={200} interval={0} tick={{ fontSize: 11 }} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <TooltipRow color="var(--color-share)" label={t("Share of gain")} value={pct(Number(value))} />
              )}
            />
          }
        />
        <Bar dataKey="share" fill="var(--color-share)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

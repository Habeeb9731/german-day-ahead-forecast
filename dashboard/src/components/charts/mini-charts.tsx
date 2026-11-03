"use client";

import { Bar, BarChart, Line, LineChart, XAxis, YAxis } from "recharts";

import { TooltipRow } from "@/components/charts/tooltip-row";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { fmt } from "@/lib/labels";
import { shortDateLabel } from "@/lib/time";
import { intlLocale, t } from "@/lib/i18n";

const unitTooltip = (color: string, label: string) => (
  <ChartTooltipContent
    labelFormatter={(value) => shortDateLabel(String(value))}
    formatter={(value) => <TooltipRow color={color} label={label} value={`${fmt(Number(value))} EUR/MWh`} />}
  />
);

interface LollipopProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

function Lollipop({ x = 0, y = 0, width = 0, height = 0 }: LollipopProps) {
  const cx = x + width / 2;
  return (
    <g>
      <rect x={cx - 2} y={y} width={4} height={height} rx={2} fill="var(--muted)" />
      <circle cx={cx} cy={y} r={5} fill="var(--color-mae)" stroke="var(--card)" strokeWidth={2} />
    </g>
  );
}

/** Daily forecast error as lollipops, one per scored day. */
export function DailyErrorLollipops({ data }: { data: { date: string; mae: number }[] }) {
  const config = { mae: { label: t("Model MAE"), color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="entrance-reveal-up aspect-auto h-36 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 0, top: 12 }}>
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          interval={0}
          tickMargin={6}
          tickFormatter={(v: string) =>
            new Intl.DateTimeFormat(intlLocale(), { weekday: "narrow", timeZone: "UTC" }).format(
              new Date(`${v}T12:00:00Z`),
            )
          }
        />
        <ChartTooltip cursor={false} content={unitTooltip("var(--color-mae)", t("Model MAE"))} />
        <Bar dataKey="mae" shape={<Lollipop />} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

/** Rolling error trend with no axes. The surrounding tile states the latest value and unit. */
export function MaeSparkline({ data }: { data: { date: string; model: number }[] }) {
  const config = { model: { label: t("Rolling MAE"), color: "var(--accent-foreground)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="entrance-reveal-x aspect-auto h-20 w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: 2, right: 2, top: 6, bottom: 2 }}>
        <XAxis dataKey="date" hide />
        {/* A sparkline shows shape, so its range fits the data. The tile states the actual value. */}
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <ChartTooltip content={unitTooltip("var(--color-model)", t("Rolling MAE"))} />
        <Line dataKey="model" type="monotone" stroke="var(--color-model)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}

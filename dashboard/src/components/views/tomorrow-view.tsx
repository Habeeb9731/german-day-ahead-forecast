"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  CircleHelp,
  Flame,
  History,
  Leaf,
  PlugZap,
  Sparkle,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";

import { ForecastChart } from "@/components/charts/forecast-chart";
import { ChartOrTable } from "@/components/chart-or-table";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SampleBanner,
  StaleBanner,
} from "@/components/page-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt } from "@/lib/labels";
import { extremeBlocks, keyStats } from "@/lib/stats";
import { dateLabel, dateTimeLabel, hourLabel, hourRangeLabel, isForecastStale } from "@/lib/time";
import type { TomorrowFile } from "@/lib/types";
import { useData } from "@/lib/use-data";

const BLOCK_HOURS = 3;

export function TomorrowView() {
  const state = useData<TomorrowFile>("tomorrow.json");

  if (state.status === "loading") return <Shell><LoadingState /></Shell>;
  if (state.status === "error") return <Shell><ErrorState message={state.message} /></Shell>;
  if (state.status === "empty") {
    return (
      <Shell>
        <EmptyState title="No forecast has been published yet">
          The first forecast appears after the daily pipeline next runs, before the 12:00 auction.
        </EmptyState>
      </Shell>
    );
  }

  const data = state.data;
  const stale = isForecastStale(data.delivery_date, new Date());

  if (data.status === "missed" || data.hours.length === 0) {
    return (
      <Shell>
        {data.is_sample && <SampleBanner />}
        <StaleBanner>
          No forecast was produced for {dateLabel(data.delivery_date)}. The pipeline did not finish
          before the cutoff, so nothing older is being shown in its place.
        </StaleBanner>
      </Shell>
    );
  }

  const stats = keyStats(data.hours)!;
  const blocks = extremeBlocks(data.hours, BLOCK_HOURS);
  const isDstDay = data.hours.length !== 24;
  const widest = data.hours.reduce((a, b) => (b.p90 - b.p10 > a.p90 - a.p10 ? b : a));
  const glance = [
    ...(blocks
      ? [
          {
            title: `Most expensive ${BLOCK_HOURS} hours`,
            detail: hourRangeLabel(blocks.priciest.start.valid_from_utc, BLOCK_HOURS),
            value: fmt(blocks.priciest.average),
            icon: Flame,
          },
          {
            title: `Cheapest ${BLOCK_HOURS} hours`,
            detail: hourRangeLabel(blocks.cheapest.start.valid_from_utc, BLOCK_HOURS),
            value: fmt(blocks.cheapest.average),
            icon: Leaf,
          },
        ]
      : []),
    {
      title: "Highest hour",
      detail: hourLabel(stats.highest.valid_from_utc, isDstDay),
      value: fmt(stats.highest.p50),
      icon: ArrowUp,
    },
    {
      title: "Lowest hour",
      detail: hourLabel(stats.lowest.valid_from_utc, isDstDay),
      value: fmt(stats.lowest.p50),
      icon: ArrowDown,
    },
    {
      title: "Least certain hour",
      detail: `${hourLabel(widest.valid_from_utc, isDstDay)}, P10–P90 width`,
      value: fmt(widest.p90 - widest.p10),
      icon: CircleHelp,
    },
  ];

  return (
    <Shell>
      {data.is_sample && <SampleBanner />}
      {stale && (
        <StaleBanner>
          This forecast is for {dateLabel(data.delivery_date)}, and a newer one should exist by now.
          The latest run may have failed. Do not use these numbers for a later day.
        </StaleBanner>
      )}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-7">
          <CardContent className="flex h-full flex-col justify-between gap-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-9 gap-2 px-4 text-sm">
                  <CalendarDays className="size-4!" aria-hidden />
                  {dateLabel(data.delivery_date)}
                </Badge>
                {isDstDay && (
                  <Badge variant="outline" className="h-9 px-4 text-sm">
                    {data.hours.length}-hour day (clock change)
                  </Badge>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground">Last updated</p>
                <p className="font-heading">{dateTimeLabel(data.generated_at_utc)}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average forecast price</p>
              <p className="font-heading text-5xl tracking-tight tabular-nums sm:text-7xl">
                {fmt(stats.average)}
                <span className="ml-2 text-base tracking-normal text-muted-foreground sm:text-lg">EUR/MWh</span>
              </p>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/ev-charging/">
                    <PlugZap aria-hidden />
                    Plan EV charging
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/track-record/">
                    <History aria-hidden />
                    Track record
                  </Link>
                </Button>
              </div>
              <Button asChild size="icon" className="size-14 shrink-0 bg-accent text-accent-foreground hover:bg-accent/80">
                <Link href="/model/" aria-label="See how the model works">
                  <ArrowUpRight className="size-6!" aria-hidden />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {blocks && (
          <Card className="relative min-w-0 bg-accent text-accent-foreground lg:col-span-5">
            <Sparkle
              className="pointer-events-none absolute -top-6 -right-6 size-48 fill-current opacity-[0.07]"
              strokeWidth={0}
              aria-hidden
            />
            <CardContent className="relative flex h-full flex-col justify-between gap-6">
              <Badge className="h-9 gap-2 bg-accent-foreground px-4 text-sm text-accent">
                <TrendingDown className="size-4!" aria-hidden />
                Cheapest {BLOCK_HOURS} hours
              </Badge>
              <div>
                <p className="font-heading text-4xl tracking-tight sm:text-5xl">
                  {hourRangeLabel(blocks.cheapest.start.valid_from_utc, BLOCK_HOURS)}
                </p>
                <p className="mt-1 text-sm">Average {fmt(blocks.cheapest.average)} EUR/MWh</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Highest", icon: ArrowUp, hour: stats.highest },
                  { label: "Lowest", icon: ArrowDown, hour: stats.lowest },
                ].map(({ label, icon: Icon, hour }) => (
                  <div key={label} className="min-w-0 rounded-2xl bg-white/45 p-3">
                    <p className="text-xs">
                      {label} at {hourLabel(hour.valid_from_utc, isDstDay)}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-heading text-xl tabular-nums">
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {fmt(hour.p50)}
                    </p>
                    <p className="text-xs">EUR/MWh</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0 lg:col-span-8">
          <CardHeader>
            <CardTitle>Hourly price forecast</CardTitle>
            <CardDescription>
              EUR/MWh. The shaded band is the P10–P90 range: the model expects about 8 in 10 prices to
              land inside it. Times are Europe/Berlin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartOrTable
              label="Hourly price forecast"
              chart={<ForecastChart hours={data.hours} />}
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hour</TableHead>
                      <TableHead className="text-right">P10</TableHead>
                      <TableHead className="text-right">P50</TableHead>
                      <TableHead className="text-right">P90</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.hours.map((h) => (
                      <TableRow key={h.valid_from_utc}>
                        <TableCell>{hourLabel(h.valid_from_utc, isDstDay)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(h.p10)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(h.p50)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(h.p90)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
            <p className="mt-3 text-sm text-muted-foreground">
              The forecast averages {fmt(stats.average)} EUR/MWh, from {fmt(stats.lowest.p50)} at{" "}
              {hourLabel(stats.lowest.valid_from_utc, isDstDay)} to {fmt(stats.highest.p50)} at{" "}
              {hourLabel(stats.highest.valid_from_utc, isDstDay)}.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-4">
          <CardHeader>
            <CardTitle>Day at a glance</CardTitle>
            <CardDescription>All values in EUR/MWh.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {glance.map((row) => (
                <li key={row.title} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border">
                    <row.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                  <p className="font-heading text-lg tabular-nums">{row.value}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">Model version {data.model_version}.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader title="Tomorrow">
        Forecast of the day-ahead wholesale price for the DE-LU bidding zone, made before the auction.
      </PageHeader>
      {children}
    </div>
  );
}

"use client";

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
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Shell>
      {data.is_sample && <SampleBanner />}
      {stale && (
        <StaleBanner>
          This forecast is for {dateLabel(data.delivery_date)}, and a newer one should exist by now.
          The latest run may have failed. Do not use these numbers for a later day.
        </StaleBanner>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{dateLabel(data.delivery_date)}</span>
        {isDstDay && <Badge variant="outline">{data.hours.length}-hour day (clock change)</Badge>}
        <span>Updated {dateTimeLabel(data.generated_at_utc)}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Average" value={fmt(stats.average)} unit="EUR/MWh" />
        <StatCard
          label="Highest"
          value={fmt(stats.highest.p50)}
          unit="EUR/MWh"
          detail={`at ${hourLabel(stats.highest.valid_from_utc, isDstDay)}`}
        />
        <StatCard
          label="Lowest"
          value={fmt(stats.lowest.p50)}
          unit="EUR/MWh"
          detail={`at ${hourLabel(stats.lowest.valid_from_utc, isDstDay)}`}
        />
      </div>

      <Card>
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

      {blocks && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label={`Cheapest ${BLOCK_HOURS} hours`}
            value={hourRangeLabel(blocks.cheapest.start.valid_from_utc, BLOCK_HOURS)}
            detail={`Average ${fmt(blocks.cheapest.average)} EUR/MWh`}
          />
          <StatCard
            label={`Most expensive ${BLOCK_HOURS} hours`}
            value={hourRangeLabel(blocks.priciest.start.valid_from_utc, BLOCK_HOURS)}
            detail={`Average ${fmt(blocks.priciest.average)} EUR/MWh`}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Model version {data.model_version}.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Tomorrow">
        Forecast of the day-ahead wholesale price for the DE-LU bidding zone, made before the auction.
      </PageHeader>
      {children}
    </div>
  );
}

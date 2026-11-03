"use client";

import { CalendarDays, FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

import { ChartOrTable } from "@/components/chart-or-table";
import { SeriesLineChart } from "@/components/charts/series-line-chart";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SampleBanner,
  StaleBanner,
} from "@/components/page-states";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmt, MODEL_LABELS } from "@/lib/labels";
import { dailySummary, rollingMae } from "@/lib/stats";
import { addDays, berlinDate, dateTimeLabel, hourLabel, parseUtc, shortDateLabel } from "@/lib/time";
import type { TrackRecordFile } from "@/lib/types";
import { useData } from "@/lib/use-data";

const HOURLY_LIMIT_DAYS = 14;
const ROLLING_DAYS = 7;
const STALE_AFTER_DAYS = 2;

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader title="Track record">
        Forecasts scored against published prices. Live and backtest results are kept separate.
      </PageHeader>
      {children}
    </div>
  );
}

export function TrackRecordView() {
  const live = useData<TrackRecordFile>("track_record.json");
  const backtest = useData<TrackRecordFile>("backtest_track.json");
  const [chosen, setChosen] = useState<"live" | "backtest" | null>(null);

  if (live.status === "loading" || backtest.status === "loading") {
    return <Shell><LoadingState /></Shell>;
  }
  const hasLive = live.status === "ready" && live.data.hours.length > 0;
  const hasBacktest = backtest.status === "ready" && backtest.data.hours.length > 0;
  if (!hasLive && !hasBacktest) {
    if (live.status === "error") return <Shell><ErrorState message={live.message} /></Shell>;
    return (
      <Shell>
        <EmptyState title="No live forecasts have been scored yet">
          A forecast is scored once its actual prices are published, about a day after it is made.
          Until then, the Model page has the backtest results.
        </EmptyState>
      </Shell>
    );
  }
  const source = chosen ?? (hasLive ? "live" : "backtest");
  const data = source === "live" && live.status === "ready" ? live.data : null;
  const shown = data ?? (backtest.status === "ready" ? backtest.data : null);
  return (
    <Shell>
      <ToggleGroup
        type="single"
        variant="outline"
        value={source}
        onValueChange={(v) => v && setChosen(v as "live" | "backtest")}
        aria-label="Forecast source"
      >
        <ToggleGroupItem value="live" disabled={!hasLive}>
          Live{hasLive ? "" : " (none yet)"}
        </ToggleGroupItem>
        <ToggleGroupItem value="backtest" disabled={!hasBacktest}>
          Backtest
        </ToggleGroupItem>
      </ToggleGroup>
      {source === "backtest" && (
        <Alert className="border-chart-4">
          <FlaskConical aria-hidden />
          <AlertTitle>Backtest: simulated past forecasts, not live results</AlertTitle>
          <AlertDescription>
            Each month&apos;s forecasts came from a model trained only on earlier data. Actual prices are
            real, but these forecasts were not published at the time.
            {!hasLive && " Live forecasts will appear here once they have been scored."}
          </AlertDescription>
        </Alert>
      )}
      {shown && <Loaded key={source} data={shown} isBacktest={source === "backtest"} />}
    </Shell>
  );
}

function Loaded({ data, isBacktest }: { data: TrackRecordFile; isBacktest: boolean }) {
  const lastDate = data.hours[data.hours.length - 1].delivery_date;
  const firstDate = data.hours[0].delivery_date;
  const [loadedAt] = useState(() => Date.now());
  const [preset, setPreset] = useState("30");
  const [custom, setCustom] = useState<DateRange | undefined>();

  const [from, to] = useMemo((): [string, string] => {
    if (preset === "custom" && custom?.from) {
      return [toIso(custom.from), toIso(custom.to ?? custom.from)];
    }
    if (preset === "all" || preset === "custom") return [firstDate, lastDate];
    return [addDays(lastDate, 1 - Number(preset)), lastDate];
  }, [preset, custom, firstDate, lastDate]);

  const inRange = useMemo(
    () => data.hours.filter((h) => h.delivery_date >= from && h.delivery_date <= to),
    [data.hours, from, to],
  );
  const daily = useMemo(() => dailySummary(inRange), [inRange]);
  const rolling = useMemo(
    () => rollingMae(data.hours, ROLLING_DAYS).filter((p) => p.date >= from && p.date <= to),
    [data.hours, from, to],
  );

  const hourly = daily.length <= HOURLY_LIMIT_DAYS;
  const chartData = hourly
    ? inRange.map((h) => ({
        x: h.valid_from_utc,
        actual: h.actual,
        forecast: h.p50,
      }))
    : daily.map((d) => ({ x: d.date, actual: d.actual, forecast: d.p50 }));

  const generatedDaysAgo = (loadedAt - parseUtc(data.generated_at_utc).getTime()) / 86_400_000;
  const rangeMae = daily.length
    ? inRange.reduce((s, h) => s + Math.abs(h.actual - h.p50), 0) / inRange.length
    : null;

  const baselineMae = (key: "baseline_prev_day" | "baseline_prev_week") => {
    const rows = inRange.filter((h) => h[key] !== null);
    return rows.length
      ? rows.reduce((s, h) => s + Math.abs(h.actual - (h[key] as number)), 0) / rows.length
      : null;
  };

  return (
    <div className="space-y-4">
      {data.is_sample && <SampleBanner />}
      {!isBacktest && generatedDaysAgo > STALE_AFTER_DAYS && (
        <StaleBanner>
          The scores were last updated on {dateTimeLabel(data.generated_at_utc)}. Scoring may have
          stopped running.
        </StaleBanner>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={preset}
          onValueChange={(v) => v && setPreset(v)}
          aria-label="Date range"
        >
          <ToggleGroupItem value="7">7 days</ToggleGroupItem>
          <ToggleGroupItem value="30">30 days</ToggleGroupItem>
          <ToggleGroupItem value="90">90 days</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={preset === "custom" ? "secondary" : "outline"} size="sm">
              <CalendarDays aria-hidden />
              {preset === "custom" && custom?.from ? `${shortDateLabel(from)} – ${shortDateLabel(to)}` : "Custom dates"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={custom}
              onSelect={(range) => {
                setCustom(range);
                setPreset("custom");
              }}
              disabled={{
                before: new Date(`${firstDate}T12:00:00`),
                after: new Date(`${lastDate}T12:00:00`),
              }}
              defaultMonth={new Date(`${lastDate}T12:00:00`)}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard accent label={`${isBacktest ? "Backtest" : "Model"} MAE, ${daily.length} days`} value={fmt(rangeMae)} unit="EUR/MWh" />
        <StatCard label={MODEL_LABELS.baseline_prev_day} value={fmt(baselineMae("baseline_prev_day"))} unit="EUR/MWh" />
        <StatCard label={MODEL_LABELS.baseline_prev_week} value={fmt(baselineMae("baseline_prev_week"))} unit="EUR/MWh" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forecast vs. actual price</CardTitle>
          <CardDescription>
            EUR/MWh, {hourly ? "by hour" : "daily averages"}, {shortDateLabel(from)} to{" "}
            {shortDateLabel(to)}. Times are Europe/Berlin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {daily.length === 0 ? (
            <EmptyState title="Nothing in this range">Pick a range with scored forecasts.</EmptyState>
          ) : (
            <ChartOrTable
              label="Forecast versus actual price"
              chart={
                <SeriesLineChart
                  data={chartData}
                  xKey="x"
                  unit="EUR/MWh"
                  tickFormatter={(v) =>
                    hourly
                      ? `${shortDateLabel(berlinDate(parseUtc(v)))} ${hourLabel(v)}`
                      : shortDateLabel(v)
                  }
                  minTickGap={48}
                  series={[
                    { key: "forecast", label: "Forecast (P50)", color: "var(--chart-1)" },
                    { key: "actual", label: "Actual", color: "var(--chart-2)", dashed: true },
                  ]}
                />
              }
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Delivery date</TableHead>
                      <TableHead className="text-right">Actual avg.</TableHead>
                      <TableHead className="text-right">Forecast avg.</TableHead>
                      <TableHead className="text-right">MAE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daily.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell>{shortDateLabel(d.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.actual)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.p50)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.mae)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}
          {rangeMae !== null && (
            <p className="mt-3 text-sm text-muted-foreground">
              Over these {daily.length} days, the model&apos;s hourly forecasts missed by{" "}
              {fmt(rangeMae)} EUR/MWh on average.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rolling {ROLLING_DAYS}-day MAE</CardTitle>
          <CardDescription>EUR/MWh. Lower is better. A point needs {ROLLING_DAYS} scored days.</CardDescription>
        </CardHeader>
        <CardContent>
          {rolling.length === 0 ? (
            <EmptyState title="Not enough history">
              This chart starts once {ROLLING_DAYS} consecutive days have been scored.
            </EmptyState>
          ) : (
            <ChartOrTable
              label={`Rolling ${ROLLING_DAYS}-day MAE`}
              chart={
                <SeriesLineChart
                  data={rolling.map((p) => ({ ...p }))}
                  xKey="date"
                  unit="EUR/MWh"
                  tickFormatter={shortDateLabel}
                  series={[
                    { key: "model", label: MODEL_LABELS.model, color: "var(--chart-1)" },
                    { key: "baseline_prev_day", label: MODEL_LABELS.baseline_prev_day, color: "var(--chart-3)", dashed: true },
                    { key: "baseline_prev_week", label: MODEL_LABELS.baseline_prev_week, color: "var(--chart-4)", dashed: true },
                  ]}
                />
              }
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">{MODEL_LABELS.model}</TableHead>
                      <TableHead className="text-right">{MODEL_LABELS.baseline_prev_day}</TableHead>
                      <TableHead className="text-right">{MODEL_LABELS.baseline_prev_week}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rolling.map((p) => (
                      <TableRow key={p.date}>
                        <TableCell>{shortDateLabel(p.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.model)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.baseline_prev_day)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.baseline_prev_week)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

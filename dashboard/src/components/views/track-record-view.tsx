"use client";

import { CalendarDays, Info } from "lucide-react";
import { de } from "react-day-picker/locale";
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
import { getLang, t } from "@/lib/i18n";
import { fmt, modelLabel } from "@/lib/labels";
import { dailySummary, rollingMae } from "@/lib/stats";
import { addDays, berlinDate, dateTimeLabel, hourLabel, parseUtc, shortDateLabel } from "@/lib/time";
import type { TrackRecordFile } from "@/lib/types";
import { useData } from "@/lib/use-data";
import { useEntranceWindow } from "@/lib/use-entrance";

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
      <PageHeader title={t("Track record")} />
      {children}
    </div>
  );
}

export function TrackRecordView() {
  const live = useData<TrackRecordFile>("track_record.json");
  const backtest = useData<TrackRecordFile>("backtest_track.json");
  const [chosen, setChosen] = useState<"live" | "backtest" | null>(null);
  useEntranceWindow(live.status !== "loading" && backtest.status !== "loading");

  if (live.status === "loading" || backtest.status === "loading") {
    return <Shell><LoadingState /></Shell>;
  }
  const hasLive = live.status === "ready" && live.data.hours.length > 0;
  const hasBacktest = backtest.status === "ready" && backtest.data.hours.length > 0;
  if (!hasLive && !hasBacktest) {
    if (live.status === "error") return <Shell><ErrorState message={live.message} /></Shell>;
    return (
      <Shell>
        <EmptyState title={t("No live forecasts have been scored yet")}>
          {t("A forecast is scored once its actual prices are published, about a day after it is made. Until then, the Model page has the backtest results.")}
        </EmptyState>
      </Shell>
    );
  }
  const source = chosen ?? (hasLive ? "live" : "backtest");
  const data = source === "live" && live.status === "ready" ? live.data : null;
  const shown = data ?? (backtest.status === "ready" ? backtest.data : null);
  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={source}
          onValueChange={(v) => v && setChosen(v as "live" | "backtest")}
          aria-label={t("Forecast source")}
        >
          <ToggleGroupItem value="live" disabled={!hasLive}>
            {hasLive ? t("Live") : t("Live (none yet)")}
          </ToggleGroupItem>
          <ToggleGroupItem value="backtest" disabled={!hasBacktest}>
            {t("Backtest")}
          </ToggleGroupItem>
        </ToggleGroup>
        {source === "backtest" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-9 bg-card"
                aria-label={t("What the backtest results mean")}
              >
                <Info aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-1 text-sm">
              <p className="font-medium">{t("Backtest: simulated past forecasts, not live results")}</p>
              <p className="text-muted-foreground">
                {t("Each month's forecasts came from a model trained only on earlier data. Actual prices are real, but these forecasts were not published at the time.")}
                {!hasLive && ` ${t("Live forecasts will appear here once they have been scored.")}`}
              </p>
            </PopoverContent>
          </Popover>
        )}
      </div>
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
          {t("The scores were last updated on {date}. Scoring may have stopped running.", { date: dateTimeLabel(data.generated_at_utc) })}
        </StaleBanner>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={preset}
          onValueChange={(v) => v && setPreset(v)}
          aria-label={t("Date range")}
        >
          <ToggleGroupItem value="7">{t("{n} days", { n: 7 })}</ToggleGroupItem>
          <ToggleGroupItem value="30">{t("{n} days", { n: 30 })}</ToggleGroupItem>
          <ToggleGroupItem value="90">{t("{n} days", { n: 90 })}</ToggleGroupItem>
          <ToggleGroupItem value="all">{t("All")}</ToggleGroupItem>
        </ToggleGroup>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={preset === "custom" ? "secondary" : "outline"} size="sm">
              <CalendarDays aria-hidden />
              {preset === "custom" && custom?.from ? `${shortDateLabel(from)} – ${shortDateLabel(to)}` : t("Custom dates")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              locale={getLang() === "de" ? de : undefined}
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

      <div className="entrance grid gap-4 sm:grid-cols-3">
        <StatCard accent label={t(isBacktest ? "Backtest MAE, {n} days" : "Model MAE, {n} days", { n: daily.length })} value={fmt(rangeMae)} unit="EUR/MWh" />
        <StatCard label={modelLabel("baseline_prev_day")} value={fmt(baselineMae("baseline_prev_day"))} unit="EUR/MWh" />
        <StatCard label={modelLabel("baseline_prev_week")} value={fmt(baselineMae("baseline_prev_week"))} unit="EUR/MWh" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Forecast vs. actual price")}</CardTitle>
          <CardDescription>
            {t(hourly ? "EUR/MWh, by hour, {from} to {to}. Times are Europe/Berlin." : "EUR/MWh, daily averages, {from} to {to}. Times are Europe/Berlin.", { from: shortDateLabel(from), to: shortDateLabel(to) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {daily.length === 0 ? (
            <EmptyState title={t("Nothing in this range")}>{t("Pick a range with scored forecasts.")}</EmptyState>
          ) : (
            <ChartOrTable
              label={t("Forecast vs. actual price")}
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
                    { key: "forecast", label: t("Forecast (P50)"), color: "var(--chart-1)" },
                    { key: "actual", label: t("Actual"), color: "var(--chart-2)", dashed: true },
                  ]}
                />
              }
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Delivery date")}</TableHead>
                      <TableHead className="text-right">{t("Actual avg.")}</TableHead>
                      <TableHead className="text-right">{t("Forecast avg.")}</TableHead>
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
              {t("Over these {n} days, the model's hourly forecasts missed by {mae} EUR/MWh on average.", { n: daily.length, mae: fmt(rangeMae) })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Rolling {n}-day MAE", { n: ROLLING_DAYS })}</CardTitle>
          <CardDescription>{t("EUR/MWh. Lower is better. A point needs {n} scored days.", { n: ROLLING_DAYS })}</CardDescription>
        </CardHeader>
        <CardContent>
          {rolling.length === 0 ? (
            <EmptyState title={t("Not enough history")}>
              {t("This chart starts once {n} consecutive days have been scored.", { n: ROLLING_DAYS })}
            </EmptyState>
          ) : (
            <ChartOrTable
              label={t("Rolling {n}-day MAE", { n: ROLLING_DAYS })}
              chart={
                <SeriesLineChart
                  data={rolling.map((p) => ({ ...p }))}
                  xKey="date"
                  unit="EUR/MWh"
                  tickFormatter={shortDateLabel}
                  series={[
                    { key: "model", label: modelLabel("model"), color: "var(--chart-1)" },
                    { key: "baseline_prev_day", label: modelLabel("baseline_prev_day"), color: "var(--chart-3)", dashed: true },
                    { key: "baseline_prev_week", label: modelLabel("baseline_prev_week"), color: "var(--chart-4)", dashed: true },
                  ]}
                />
              }
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Date")}</TableHead>
                      <TableHead className="text-right">{modelLabel("model")}</TableHead>
                      <TableHead className="text-right">{modelLabel("baseline_prev_day")}</TableHead>
                      <TableHead className="text-right">{modelLabel("baseline_prev_week")}</TableHead>
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

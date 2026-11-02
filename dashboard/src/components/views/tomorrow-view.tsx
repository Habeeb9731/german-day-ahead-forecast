"use client";

import { ArrowRight, ArrowUpRight, CalendarDays, Clock, Zap } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";

import { ForecastChart } from "@/components/charts/forecast-chart";
import { HourlyBars } from "@/components/charts/hourly-bars";
import { DailyErrorLollipops, MaeSparkline } from "@/components/charts/mini-charts";
import { ErrorState, LoadingState, SampleBanner, StaleBanner, EmptyState } from "@/components/page-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { latestScoredDay, leastCertainHour, liveCoverage, negativeHours, recentDays } from "@/lib/dashboard";
import { cheapestSchedule } from "@/lib/ev";
import { eur, featureLabel, fmt, MODEL_LABELS } from "@/lib/labels";
import { extremeBlocks, keyStats, rollingMae } from "@/lib/stats";
import {
  dateLabel,
  dateTimeLabel,
  hourLabel,
  hourRangeLabel,
  isForecastStale,
  shortDateLabel,
} from "@/lib/time";
import type { BacktestFile, ModelName, TomorrowFile, TrackRecordFile } from "@/lib/types";
import { useData } from "@/lib/use-data";
import { cn } from "@/lib/utils";

const BLOCK_HOURS = 3;
const EV_KWH = 40;
const EV_KW = 11;
const RECENT_DAYS = 7;
const MODELS: ModelName[] = ["model", "baseline_prev_day", "baseline_prev_week"];

/** Small title with the square marker used on every widget. */
function WidgetTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="size-3 shrink-0 rounded-[4px] bg-accent ring-1 ring-foreground/10" aria-hidden />
        {children}
      </h2>
      {action}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground tabular-nums">
      {children}
    </span>
  );
}

function BigNumber({ value, unit, size = "lg" }: { value: string; unit?: string; size?: "sm" | "lg" | "xl" }) {
  return (
    <p
      className={cn(
        "font-heading tracking-tight tabular-nums",
        size === "xl" ? "text-5xl" : size === "lg" ? "text-3xl" : "text-2xl",
      )}
    >
      {value}
      {unit && <span className="ml-1 text-xs tracking-normal text-muted-foreground">{unit}</span>}
    </p>
  );
}

function Widget({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card size="sm" className={cn("min-w-0 gap-3", className)}>
      <CardContent className="flex h-full flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="flex flex-1 items-center text-sm text-muted-foreground">{children}</p>;
}

export function TomorrowView() {
  const forecast = useData<TomorrowFile>("tomorrow.json");
  const track = useData<TrackRecordFile>("track_record.json");
  const backtest = useData<BacktestFile>("backtest.json");

  const hours = useMemo(
    () => (forecast.status === "ready" && forecast.data.status === "ok" ? forecast.data.hours : []),
    [forecast],
  );
  const trackHours = useMemo(() => (track.status === "ready" ? track.data.hours : []), [track]);
  const report = backtest.status === "ready" ? backtest.data : null;

  const stats = keyStats(hours);
  const blocks = extremeBlocks(hours, BLOCK_HOURS);
  const isDstDay = hours.length !== 24 && hours.length > 0;
  const widest = leastCertainHour(hours);
  const negative = negativeHours(hours);

  const latest = useMemo(() => latestScoredDay(trackHours), [trackHours]);
  const recent = useMemo(() => recentDays(trackHours, RECENT_DAYS), [trackHours]);
  const coverage = useMemo(() => liveCoverage(trackHours), [trackHours]);
  const rolling = useMemo(() => rollingMae(trackHours, RECENT_DAYS).slice(-60), [trackHours]);
  const lastRolling = rolling[rolling.length - 1];

  const ev = useMemo(
    () =>
      hours.length
        ? cheapestSchedule({ hours, energyKwh: EV_KWH, powerKw: EV_KW, windowStart: 0, windowEnd: hours.length })
        : null,
    [hours],
  );
  const chargingHours = new Set(ev?.feasible ? ev.slots.map((s) => s.valid_from_utc) : []);

  const isSample =
    (forecast.status === "ready" && forecast.data.is_sample) ||
    (track.status === "ready" && track.data.is_sample) ||
    Boolean(report?.is_sample);

  const delivery = forecast.status === "ready" ? forecast.data : null;
  const stale = delivery ? isForecastStale(delivery.delivery_date, new Date()) : false;
  const features = report ? Object.entries(report.feature_importance).slice(0, 3) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-3xl leading-none tracking-tight sm:text-4xl">
            <span className="block text-muted-foreground">German power</span>
            <span className="block font-medium">Tomorrow</span>
          </h1>
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Zap className="size-5" aria-hidden />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {delivery && (
            <Badge variant="secondary" className="h-10 gap-2 bg-card px-4 text-sm">
              <CalendarDays className="size-4!" aria-hidden />
              {dateLabel(delivery.delivery_date)}
            </Badge>
          )}
          {isDstDay && (
            <Badge variant="outline" className="h-10 px-4 text-sm">
              {hours.length}-hour day (clock change)
            </Badge>
          )}
          {delivery && (
            <Badge variant="secondary" className="h-10 gap-2 bg-card px-4 text-sm">
              <Clock className="size-4!" aria-hidden />
              Updated {dateTimeLabel(delivery.generated_at_utc)}
            </Badge>
          )}
          <Button asChild className="h-10 pr-1.5 pl-4">
            <Link href="/track-record/">
              Track record
              <span className="flex size-7 items-center justify-center rounded-full bg-primary-foreground text-primary">
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          </Button>
        </div>
      </div>

      {isSample && <SampleBanner />}
      {forecast.status === "loading" && <LoadingState />}
      {forecast.status === "error" && <ErrorState message={forecast.message} />}
      {forecast.status === "empty" && (
        <EmptyState title="No forecast has been published yet">
          The first forecast appears after the daily pipeline next runs, before the 12:00 auction.
        </EmptyState>
      )}
      {delivery?.status === "missed" && (
        <StaleBanner>
          No forecast was produced for {dateLabel(delivery.delivery_date)}. The pipeline did not finish
          before the cutoff, so nothing older is being shown in its place.
        </StaleBanner>
      )}
      {stale && delivery?.status === "ok" && (
        <StaleBanner>
          This forecast is for {dateLabel(delivery.delivery_date)}, and a newer one should exist by now.
          The latest run may have failed. Do not use these numbers for a later day.
        </StaleBanner>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        {stats && (
          <Card size="sm" className="min-w-0 gap-0 py-0 xl:col-span-3">
            <div className="flex flex-1 flex-col gap-6 p-5">
              <WidgetTitle>
                Average price
              </WidgetTitle>
              <div>
                <BigNumber size="xl" value={fmt(stats.average)} />
                <p className="mt-1 text-xs text-muted-foreground">EUR/MWh, forecast for the whole day</p>
              </div>
              <ul className="divide-y text-sm">
                <li className="flex items-center justify-between gap-2 py-2">
                  <span className="text-muted-foreground">Spread, high to low</span>
                  <span className="tabular-nums">{fmt(stats.highest.p50 - stats.lowest.p50)}</span>
                </li>
                <li className="flex items-center justify-between gap-2 py-2">
                  <span className="text-muted-foreground">Average P10–P90 width</span>
                  <span className="tabular-nums">
                    {fmt(hours.reduce((sum, h) => sum + h.p90 - h.p10, 0) / hours.length)}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2 py-2">
                  <span className="text-muted-foreground">Hours below average</span>
                  <span className="tabular-nums">
                    {hours.filter((h) => h.p50 < stats.average).length} of {hours.length}
                  </span>
                </li>
              </ul>
              {latest && (
                <p className="mt-auto text-xs text-muted-foreground">
                  {shortDateLabel(latest.date)} actually averaged{" "}
                  <span className="font-medium text-foreground tabular-nums">{fmt(latest.actual)}</span>{" "}
                  EUR/MWh.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 divide-x border-t">
              {[
                { label: "Highest", hour: stats.highest },
                { label: "Lowest", hour: stats.lowest },
              ].map(({ label, hour }) => (
                <div key={label} className="min-w-0 p-4">
                  <BigNumber size="sm" value={fmt(hour.p50)} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {label} at {hourLabel(hour.valid_from_utc, isDstDay)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {stats && (
          <Widget className="md:col-span-2 xl:col-span-6 xl:row-span-1">
            <WidgetTitle>Hourly price forecast</WidgetTitle>
            {blocks && (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Cheapest</span>
                  <span className="font-heading text-2xl tabular-nums">
                    {hourRangeLabel(blocks.cheapest.start.valid_from_utc, BLOCK_HOURS)}
                  </span>
                  <Pill>{fmt(blocks.cheapest.average)}</Pill>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Priciest</span>
                  <span className="font-heading text-2xl tabular-nums">
                    {hourRangeLabel(blocks.priciest.start.valid_from_utc, BLOCK_HOURS)}
                  </span>
                  <Badge variant="secondary" className="tabular-nums">{fmt(blocks.priciest.average)}</Badge>
                </div>
              </div>
            )}
            <Tabs defaultValue="bars" className="min-w-0 gap-2">
              <TabsContent value="bars" className="min-w-0">
                <HourlyBars hours={hours} blockStartUtc={blocks?.cheapest.start.valid_from_utc} blockHours={BLOCK_HOURS} />
              </TabsContent>
              <TabsContent value="range" className="min-w-0">
                <div className="h-60 [&_[data-slot=chart]]:h-60!">
                  <ForecastChart hours={hours} />
                </div>
              </TabsContent>
              <TabsContent value="table" className="min-w-0">
                <div className="h-60 overflow-auto rounded-2xl border" tabIndex={0} role="region" aria-label="Hourly price forecast, data table">
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
                      {hours.map((h) => (
                        <TableRow key={h.valid_from_utc}>
                          <TableCell>{hourLabel(h.valid_from_utc, isDstDay)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(h.p10)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(h.p50)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(h.p90)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsList aria-label="Hourly price forecast: choose a view">
                <TabsTrigger value="bars">Bars</TabsTrigger>
                <TabsTrigger value="range">P10–P90 range</TabsTrigger>
                <TabsTrigger value="table">Table</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              EUR/MWh, Europe/Berlin. The forecast runs from {fmt(stats.lowest.p50)} at{" "}
              {hourLabel(stats.lowest.valid_from_utc, isDstDay)} to {fmt(stats.highest.p50)} at{" "}
              {hourLabel(stats.highest.valid_from_utc, isDstDay)}.
            </p>
          </Widget>
        )}

        <Widget className="xl:col-span-3">
          <WidgetTitle
            action={
              <Button asChild variant="ghost" size="icon" className="size-7">
                <Link href="/model/" aria-label="Open model details">
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </Button>
            }
          >
            Backtest scorecard
          </WidgetTitle>
          {report ? (
            <>
              <div>
                <BigNumber value={fmt(report.overall.model?.mae)} unit="EUR/MWh MAE" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.days_scored} days, simulated past forecasts, not live results
                </p>
              </div>
              <ul className="divide-y text-sm">
                {MODELS.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">{MODEL_LABELS[m]}</span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      {fmt(report.overall[m]?.mae)}
                      {m !== "model" && (
                        <Badge variant={report.significance[m].verdict === "baseline better" ? "destructive" : "secondary"}>
                          {report.significance[m].verdict === "model better"
                            ? "Beaten"
                            : report.significance[m].verdict === "baseline better"
                              ? "Lost"
                              : "Unclear"}
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center justify-between gap-2 rounded-2xl bg-muted p-3 text-xs">
                <span>P10–P90 coverage (target 80%)</span>
                <span className="font-heading text-base text-foreground tabular-nums">
                  {fmt(report.overall.model?.coverage_p10_p90, 1)}%
                </span>
              </div>
              {features.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Relies on most</p>
                  {features.map(([key, share]) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{featureLabel(key)}</span>
                      <span className="tabular-nums">{fmt(share * 100, 1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Quiet>
              {backtest.status === "loading"
                ? "Loading…"
                : backtest.status === "error"
                  ? "The backtest could not be loaded."
                  : "Backtest results appear once it has run on real data."}
            </Quiet>
          )}
        </Widget>

        {ev && (
          <Widget className="md:col-span-2 xl:col-span-4">
            <WidgetTitle
              action={
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <Link href="/ev-charging/" aria-label="Open the EV charging calculator">
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              }
            >
              EV charging, {EV_KWH} kWh at {EV_KW} kW
            </WidgetTitle>
            {ev.feasible ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <BigNumber size="sm" value={eur(ev.costEur)} />
                    <p className="text-xs text-muted-foreground">Cheapest hours</p>
                  </div>
                  <div>
                    <BigNumber size="sm" value={ev.sixPm ? eur(ev.sixPm.costEur) : "n/a"} />
                    <p className="text-xs text-muted-foreground">From 18:00</p>
                  </div>
                  <div className="rounded-2xl bg-accent px-3 py-1.5 text-accent-foreground">
                    <p className="font-heading text-2xl tracking-tight tabular-nums">{eur(ev.savingsEur)}</p>
                    <p className="text-xs">Saving</p>
                  </div>
                </div>
                <div>
                  <div className="flex gap-0.5" aria-hidden>
                    {hours.map((h) => (
                      <span
                        key={h.valid_from_utc}
                        className={cn(
                          "h-8 min-w-0 flex-1 rounded-[4px]",
                          chargingHours.has(h.valid_from_utc) ? "bg-accent ring-1 ring-foreground/20" : "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground" aria-hidden>
                    <span>00:00</span>
                    <span>12:00</span>
                    <span>24:00</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Charge at {ev.slots.map((s) => hourLabel(s.valid_from_utc, isDstDay)).join(", ")}.
                  Wholesale prices only: excludes taxes, grid fees and supplier charges.
                </p>
              </>
            ) : (
              <Quiet>This charge does not fit in the forecast day.</Quiet>
            )}
          </Widget>
        )}

        <Widget className="xl:col-span-3">
          <WidgetTitle>Live error, last {RECENT_DAYS} days</WidgetTitle>
          {recent.length > 0 ? (
            <>
              <DailyErrorLollipops data={recent.map((d) => ({ date: d.date, mae: d.mae }))} />
              <ul className="sr-only">
                {recent.map((d) => (
                  <li key={d.date}>
                    {shortDateLabel(d.date)}: MAE {fmt(d.mae)} EUR/MWh
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Daily MAE of live forecasts, EUR/MWh.</p>
            </>
          ) : (
            <Quiet>Appears once live forecasts have been scored.</Quiet>
          )}
        </Widget>

        <Card size="sm" className="min-w-0 gap-2 bg-accent text-accent-foreground xl:col-span-2">
          <CardContent className="flex h-full flex-col gap-2">
            <h2 className="text-sm font-medium">Rolling {RECENT_DAYS}-day MAE</h2>
            {lastRolling ? (
              <>
                <p className="font-heading text-3xl tracking-tight tabular-nums">
                  {fmt(lastRolling.model)}
                  <span className="ml-1 text-xs tracking-normal">EUR/MWh</span>
                </p>
                <div className="mt-auto">
                  <MaeSparkline data={rolling.map((p) => ({ date: p.date, model: p.model }))} />
                </div>
                <p className="text-xs">To {shortDateLabel(lastRolling.date)}. Lower is better.</p>
              </>
            ) : (
              <p className="flex flex-1 items-center text-sm">Needs {RECENT_DAYS} scored days.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 grid-cols-2 gap-3 md:col-span-2 xl:col-span-3">
          {[
            {
              label: latest ? `Error on ${shortDateLabel(latest.date)}` : "Latest error",
              value: latest ? fmt(latest.mae) : "n/a",
              unit: latest ? "EUR/MWh" : undefined,
              note: latest ? "Most recent scored day" : "Not scored yet",
            },
            {
              label: "Live coverage",
              value: coverage === null ? "n/a" : `${fmt(coverage, 1)}%`,
              note: coverage === null ? "Not scored yet" : "Last 30 days, target 80%",
            },
            {
              label: "Negative hours",
              value: String(negative.likely),
              note: `${negative.possible} possible at P10`,
            },
            {
              label: "Least certain",
              value: widest ? hourLabel(widest.valid_from_utc, isDstDay) : "n/a",
              note: widest ? `P10–P90 width ${fmt(widest.p90 - widest.p10)}` : "No forecast",
            },
          ].map((tile) => (
            <Card key={tile.label} size="sm" className="min-w-0 gap-1 bg-card">
              <CardContent className="flex h-full flex-col gap-1">
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                <BigNumber size="sm" value={tile.value} unit={tile.unit} />
                <p className="mt-auto text-xs text-muted-foreground">{tile.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {delivery && <p className="text-xs text-muted-foreground">Model version {delivery.model_version}.</p>}
    </div>
  );
}

"use client";

import { ArrowRight, ArrowUpRight, CalendarDays, Clock, Info } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";

import { ForecastChart } from "@/components/charts/forecast-chart";
import { HourlyBars } from "@/components/charts/hourly-bars";
import { DailyErrorLollipops, MaeSparkline } from "@/components/charts/mini-charts";
import {
  EmptyState,
  ErrorState,
  GridSkeleton,
  PageHeader,
  SampleBanner,
  StaleBanner,
  WidgetTitle,
} from "@/components/page-states";
import { CountUp } from "@/components/count-up";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { t } from "@/lib/i18n";
import { eur, featureLabel, fmt, modelLabel, pct } from "@/lib/labels";
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
import { useEntranceWindow } from "@/lib/use-entrance";
import { cn } from "@/lib/utils";

const BLOCK_HOURS = 3;
const EV_KWH = 40;
const EV_KW = 11;
const RECENT_DAYS = 7;
const MODELS: ModelName[] = ["model", "baseline_prev_day", "baseline_prev_week"];

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
  const history = useData<TrackRecordFile>("backtest_recent.json");

  const historyHours = useMemo(() => (history.status === "ready" ? history.data.hours : []), [history]);
  // Until the first live forecast exists, the last backtest day stands in, clearly labelled. A missed
  // or stale day never does: those must stay visible rather than be papered over.
  const exampleDate =
    forecast.status === "empty" && historyHours.length > 0
      ? historyHours[historyHours.length - 1].delivery_date
      : null;
  const hours = useMemo(() => {
    if (exampleDate) return historyHours.filter((h) => h.delivery_date === exampleDate);
    return forecast.status === "ready" && forecast.data.status === "ok" ? forecast.data.hours : [];
  }, [forecast, exampleDate, historyHours]);
  const trackHours = useMemo(() => (track.status === "ready" ? track.data.hours : []), [track]);
  const report = backtest.status === "ready" ? backtest.data : null;

  const stats = keyStats(hours);
  const blocks = extremeBlocks(hours, BLOCK_HOURS);
  const isDstDay = hours.length !== 24 && hours.length > 0;
  const widest = leastCertainHour(hours);
  const negative = negativeHours(hours);

  // Each record panel prefers live data and falls back to the backtest, which it then labels.
  const liveRolling = useMemo(() => rollingMae(trackHours, RECENT_DAYS), [trackHours]);
  const backtestRolling = useMemo(() => rollingMae(historyHours, RECENT_DAYS), [historyHours]);
  const recordIsBacktest = trackHours.length === 0;
  const recordHours = recordIsBacktest ? historyHours : trackHours;
  const rollingIsBacktest = liveRolling.length === 0;
  const latest = useMemo(() => latestScoredDay(recordHours), [recordHours]);
  const recent = useMemo(() => recentDays(recordHours, RECENT_DAYS), [recordHours]);
  const coverage = useMemo(() => liveCoverage(recordHours), [recordHours]);
  const rolling = (rollingIsBacktest ? backtestRolling : liveRolling).slice(-60);
  const lastRolling = rolling[rolling.length - 1];
  const recordWord = recordIsBacktest ? t("Backtest") : t("Live");

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
    Boolean(report?.is_sample) ||
    (history.status === "ready" && history.data.is_sample);

  // Show everything at once. The files arrive separately, and panels appearing one by one made the
  // page jump and their animations start at different times.
  const settled = [forecast, track, backtest, history].every((s) => s.status !== "loading");
  useEntranceWindow(settled);

  const delivery = forecast.status === "ready" ? forecast.data : null;
  const stale = delivery ? isForecastStale(delivery.delivery_date, new Date()) : false;
  const features = report ? Object.entries(report.feature_importance).slice(0, 3) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
        <PageHeader title={t("Tomorrow")} />
        {/* On phones: page name and Track record share a row, with the status badges in a row below. */}
        <span className="order-2 basis-full md:hidden" aria-hidden />
        <div className="flex flex-wrap items-center gap-2 max-md:contents">
          {delivery && (
            <Badge variant="secondary" className="h-10 gap-2 bg-card px-4 text-sm max-md:order-3 max-md:basis-full">
              <CalendarDays className="size-4! shrink-0" aria-hidden />
              {dateLabel(delivery.delivery_date)}
            </Badge>
          )}
          {exampleDate && settled && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-10 bg-card max-md:order-3"
                  aria-label={t("Why this page shows a backtest example")}
                >
                  <Info aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-1 text-sm">
                <p className="font-medium">{t("No forecast has been published yet")}</p>
                <p className="text-muted-foreground">
                  {t("The first forecast appears after the daily pipeline next runs, before the 12:00 auction. Until then, the forecast panels show {date} from the backtest as an example.", { date: dateLabel(exampleDate) })}
                </p>
              </PopoverContent>
            </Popover>
          )}
          {exampleDate && settled && (
            <Badge variant="outline" className="h-10 min-w-0 gap-2 border-chart-4 px-4 text-sm max-md:order-3 max-md:flex-1 max-md:px-3 max-md:text-xs">
              <CalendarDays className="size-4! shrink-0 max-[359px]:hidden" aria-hidden />
              {t("Backtest example: {date}", { date: dateLabel(exampleDate) })}
            </Badge>
          )}
          {isDstDay && (
            <Badge variant="outline" className="h-10 px-4 text-sm max-md:order-3 max-md:basis-full max-md:text-xs">
              {t("{n}-hour day (clock change)", { n: hours.length })}
            </Badge>
          )}
          {delivery && (
            <Badge variant="secondary" className="h-10 gap-2 bg-card px-4 text-sm max-md:order-3 max-md:basis-full max-md:text-xs">
              <Clock className="size-4! shrink-0" aria-hidden />
              {t("Updated {date}", { date: dateTimeLabel(delivery.generated_at_utc) })}
            </Badge>
          )}
          <Button asChild className="h-10 pr-1.5 pl-4 max-md:order-1">
            <Link href="/track-record/">
              {t("Track record")}
              <span className="flex size-7 items-center justify-center rounded-full bg-primary-foreground text-primary">
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          </Button>
        </div>
      </div>

      {isSample && settled && <SampleBanner />}
      {!settled && (
        <GridSkeleton
          cells={[
            "h-[436px] xl:col-span-3",
            "h-[436px] md:col-span-2 xl:col-span-6",
            "h-[436px] xl:col-span-3",
            "h-[284px] md:col-span-2 xl:col-span-4",
            "h-[284px] xl:col-span-3",
            "h-[284px] xl:col-span-2",
            "h-[284px] md:col-span-2 xl:col-span-3",
          ]}
        />
      )}
      {forecast.status === "error" && <ErrorState message={forecast.message} />}
      {/* With no history to show as an example, this is the only explanation, so it stays visible. */}
      {forecast.status === "empty" && !exampleDate && settled && (
        <EmptyState title={t("No forecast has been published yet")}>
          {t("The first forecast appears after the daily pipeline next runs, before the 12:00 auction.")}
        </EmptyState>
      )}
      {delivery?.status === "missed" && (
        <StaleBanner>
          {t("No forecast was produced for {date}. The pipeline did not finish before the cutoff, so nothing older is being shown in its place.", { date: dateLabel(delivery.delivery_date) })}
        </StaleBanner>
      )}
      {stale && delivery?.status === "ok" && (
        <StaleBanner>
          {t("This forecast is for {date}, and a newer one should exist by now. The latest run may have failed. Do not use these numbers for a later day.", { date: dateLabel(delivery.delivery_date) })}
        </StaleBanner>
      )}

      {settled && (
      <div className="entrance grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        {stats && (
          <Card size="sm" className="relative isolate min-w-0 gap-0 py-0 text-white xl:col-span-3 dark:ring-0">
            <Image
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/images/wind-turbine.jpg`}
              alt=""
              fill
              priority
              sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
              className="-z-20 object-cover object-[70%_center]"
            />
            {/* Keeps white text readable where it crosses the white blade. */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04154a]/50 via-[#04154a]/10 to-[#04154a]/60" aria-hidden />
            <div className="flex flex-1 flex-col gap-5 p-5">
              <div className="flex min-h-7 items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-3 shrink-0 rounded-[4px] bg-white" aria-hidden />
                  {t("Average price")}
                </h2>
                {exampleDate && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#04154a]">
                    {t("Backtest")}
                  </span>
                )}
              </div>
              <div>
                <p className="font-heading text-5xl tracking-tight tabular-nums"><CountUp value={stats.average} format={fmt} /></p>
                <p className="mt-1 text-xs">{t("All prices in EUR/MWh")}</p>
              </div>
              <ul className="mt-auto divide-y divide-white/20 rounded-2xl bg-[#04154a]/60 px-3 text-sm backdrop-blur-md">
                <li className="flex items-center justify-between gap-2 py-2">
                  <span>{t("Spread, high to low")}</span>
                  <span className="tabular-nums">{fmt(stats.highest.p50 - stats.lowest.p50)}</span>
                </li>
                <li className="flex items-center justify-between gap-2 py-2">
                  <span>{t("Average P10–P90 width")}</span>
                  <span className="tabular-nums">
                    {fmt(hours.reduce((sum, h) => sum + h.p90 - h.p10, 0) / hours.length)}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2 py-2">
                  <span>{t("Hours below average")}</span>
                  <span className="shrink-0 tabular-nums">
                    {t("{count} of {total}", { count: hours.filter((h) => h.p50 < stats.average).length, total: hours.length })}
                  </span>
                </li>
                {latest && (
                  <li className="flex items-center justify-between gap-2 py-2">
                    <span>{t("{date} actual average", { date: shortDateLabel(latest.date) })}</span>
                    <span className="font-medium tabular-nums">{fmt(latest.actual)}</span>
                  </li>
                )}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Highest at {hour}", hour: stats.highest },
                  { label: "Lowest at {hour}", hour: stats.lowest },
                ].map(({ label, hour }) => (
                  <div key={label} className="min-w-0 rounded-2xl bg-[#04154a]/60 p-3 backdrop-blur-md">
                    <p className="font-heading text-2xl tracking-tight tabular-nums">{fmt(hour.p50)}</p>
                    <p className="mt-0.5 text-xs">
                      {t(label, { hour: hourLabel(hour.valid_from_utc, isDstDay) })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {stats && (
          <Widget className="md:col-span-2 xl:col-span-6 xl:row-span-1">
            <WidgetTitle action={exampleDate ? <Pill>{t("Backtest")}</Pill> : undefined}>{t("Hourly price forecast")}</WidgetTitle>
            {blocks && (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Cheapest")}</span>
                  <span className="font-heading text-2xl tabular-nums">
                    {hourRangeLabel(blocks.cheapest.start.valid_from_utc, BLOCK_HOURS)}
                  </span>
                  <Pill>{fmt(blocks.cheapest.average)}</Pill>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Priciest")}</span>
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
                <div className="h-60 overflow-auto rounded-2xl border" tabIndex={0} role="region" aria-label={t("{label}, data table", { label: t("Hourly price forecast") })}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Hour")}</TableHead>
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
              <TabsList aria-label={t("{label}: choose a view", { label: t("Hourly price forecast") })}>
                <TabsTrigger value="bars">{t("Bars")}</TabsTrigger>
                <TabsTrigger value="range">{t("P10–P90 range")}</TabsTrigger>
                <TabsTrigger value="table">{t("Table")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              {t("EUR/MWh, Europe/Berlin. The forecast runs from {low} at {lowHour} to {high} at {highHour}.", {
                low: fmt(stats.lowest.p50),
                lowHour: hourLabel(stats.lowest.valid_from_utc, isDstDay),
                high: fmt(stats.highest.p50),
                highHour: hourLabel(stats.highest.valid_from_utc, isDstDay),
              })}
            </p>
          </Widget>
        )}

        <Widget className="xl:col-span-3">
          <WidgetTitle
            action={
              <Button asChild variant="ghost" size="icon" className="size-7">
                <Link href="/model/" aria-label={t("Open model details")}>
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </Button>
            }
          >
            {t("Backtest scorecard")}
          </WidgetTitle>
          {report ? (
            <>
              <div>
                <p className="font-heading text-3xl tracking-tight tabular-nums">
                  {report.overall.model ? <CountUp value={report.overall.model.mae} format={fmt} /> : t("n/a")}
                  <span className="ml-1 text-xs tracking-normal text-muted-foreground">EUR/MWh MAE</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("{n} days, simulated past forecasts, not live results", { n: report.days_scored })}
                </p>
              </div>
              <ul className="divide-y text-sm">
                {MODELS.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">{modelLabel(m)}</span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      {fmt(report.overall[m]?.mae)}
                      {m !== "model" && (
                        <Badge variant={report.significance[m].verdict === "baseline better" ? "destructive" : "secondary"}>
                          {report.significance[m].verdict === "model better"
                            ? t("Beaten")
                            : report.significance[m].verdict === "baseline better"
                              ? t("Lost")
                              : t("Unclear")}
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center justify-between gap-2 rounded-2xl bg-muted p-3 text-xs">
                <span>{t("P10–P90 coverage (target 80%)")}</span>
                <span className="font-heading text-base text-foreground tabular-nums">
                  {pct(report.overall.model?.coverage_p10_p90)}
                </span>
              </div>
              {features.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t("Relies on most")}</p>
                  {features.map(([key, share]) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{featureLabel(key)}</span>
                      <span className="tabular-nums">{pct(share * 100)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Quiet>
              {backtest.status === "loading"
                ? t("Loading…")
                : backtest.status === "error"
                  ? t("The backtest could not be loaded.")
                  : t("Backtest results appear once it has run on real data.")}
            </Quiet>
          )}
        </Widget>

        {ev && (
          <Widget className="md:col-span-2 xl:col-span-4">
            <WidgetTitle
              action={
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <Link href="/ev-charging/" aria-label={t("Open the EV charging calculator")}>
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              }
            >
              {t(exampleDate ? "EV charging, {kwh} kWh at {kw} kW (backtest example)" : "EV charging, {kwh} kWh at {kw} kW", { kwh: EV_KWH, kw: EV_KW })}
            </WidgetTitle>
            {ev.feasible ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <BigNumber size="sm" value={eur(ev.costEur)} />
                    <p className="text-xs text-muted-foreground">{t("Cheapest hours")}</p>
                  </div>
                  <div>
                    <BigNumber size="sm" value={ev.sixPm ? eur(ev.sixPm.costEur) : t("n/a")} />
                    <p className="text-xs text-muted-foreground">{t("From 18:00")}</p>
                  </div>
                  <div className="rounded-2xl bg-accent px-3 py-1.5 text-accent-foreground">
                    <p className="font-heading text-2xl tracking-tight tabular-nums">
                      {ev.savingsEur === null ? t("n/a") : <CountUp value={ev.savingsEur} format={eur} />}
                    </p>
                    <p className="text-xs">{t("Saving")}</p>
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
                  {t("Charge at {hours}.", { hours: ev.slots.map((s) => hourLabel(s.valid_from_utc, isDstDay)).join(", ") })}{" "}
                  {t("Wholesale prices only: excludes taxes, grid fees and supplier charges.")}
                </p>
              </>
            ) : (
              <Quiet>{t("This charge does not fit in the forecast day.")}</Quiet>
            )}
          </Widget>
        )}

        <Widget className="xl:col-span-3">
          <WidgetTitle>{t("{source} error, last {n} days", { source: recordWord, n: RECENT_DAYS })}</WidgetTitle>
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
              <p className="text-xs text-muted-foreground">
                {t(recordIsBacktest ? "Daily MAE of simulated backtest forecasts, EUR/MWh." : "Daily MAE of live forecasts, EUR/MWh.")}
              </p>
            </>
          ) : (
            <Quiet>{t("Appears once live forecasts have been scored.")}</Quiet>
          )}
        </Widget>

        <Card size="sm" className="min-w-0 gap-2 bg-accent text-accent-foreground xl:col-span-2">
          <CardContent className="flex h-full flex-col gap-2">
            <h2 className="text-sm font-medium">{t(rollingIsBacktest ? "Backtest rolling {n}-day MAE" : "Rolling {n}-day MAE", { n: RECENT_DAYS })}</h2>
            {lastRolling ? (
              <>
                <p className="font-heading text-3xl tracking-tight tabular-nums">
                  {fmt(lastRolling.model)}
                  <span className="ml-1 text-xs tracking-normal">EUR/MWh</span>
                </p>
                <div className="mt-auto">
                  <MaeSparkline data={rolling.map((p) => ({ date: p.date, model: p.model }))} />
                </div>
                <p className="text-xs">{t("To {date}. Lower is better.", { date: shortDateLabel(lastRolling.date) })}</p>
              </>
            ) : (
              <p className="flex flex-1 items-center text-sm">{t("Needs {n} scored days.", { n: RECENT_DAYS })}</p>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 grid-cols-2 gap-3 md:col-span-2 xl:col-span-3">
          {[
            {
              label: latest ? t("{source} error on {date}", { source: recordWord, date: shortDateLabel(latest.date) }) : t("Latest error"),
              value: latest ? fmt(latest.mae) : t("n/a"),
              unit: latest ? "EUR/MWh" : undefined,
              note: latest ? t("Most recent scored day") : t("Not scored yet"),
            },
            {
              label: t("{source} coverage", { source: recordWord }),
              value: coverage === null ? t("n/a") : pct(coverage),
              note: coverage === null ? t("Not scored yet") : t("Last 30 days, target 80%"),
            },
            {
              label: t("Negative hours"),
              value: String(negative.likely),
              note: t("{n} possible at P10", { n: negative.possible }),
            },
            {
              label: t("Least certain"),
              value: widest ? hourLabel(widest.valid_from_utc, isDstDay) : t("n/a"),
              note: widest ? t("P10–P90 width {value}", { value: fmt(widest.p90 - widest.p10) }) : t("No forecast"),
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
      )}
      {delivery && settled && <p className="text-xs text-muted-foreground">{t("Model version {version}.", { version: delivery.model_version })}</p>}
    </div>
  );
}

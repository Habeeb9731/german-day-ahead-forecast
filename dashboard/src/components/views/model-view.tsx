"use client";

import { Calculator, CloudSun, Gauge, History, Zap } from "lucide-react";

import { ComparisonBars } from "@/components/charts/comparison-bars";
import { ImportanceChart } from "@/components/charts/importance-chart";
import { SeriesLineChart } from "@/components/charts/series-line-chart";
import {
  EmptyState,
  ErrorState,
  GridSkeleton,
  PageHeader,
  SampleBanner,
  WidgetTitle,
} from "@/components/page-states";
import { CountUp } from "@/components/count-up";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/i18n";
import { featureLabel, fmt, modelLabel, pct, regimeLabel } from "@/lib/labels";
import { dateLabel, dateTimeLabel } from "@/lib/time";
import type { BacktestFile, ModelName, ScoreSet } from "@/lib/types";
import { useData } from "@/lib/use-data";
import { useEntranceWindow } from "@/lib/use-entrance";
import { cn } from "@/lib/utils";

const MODELS: ModelName[] = ["model", "baseline_prev_day", "baseline_prev_week"];
function series() {
  return [
    { key: "model", label: modelLabel("model"), color: "var(--chart-1)" },
    { key: "baseline_prev_day", label: modelLabel("baseline_prev_day"), color: "var(--chart-3)", dashed: true },
    { key: "baseline_prev_week", label: modelLabel("baseline_prev_week"), color: "var(--chart-4)", dashed: true },
  ];
}
const COLORS: Record<ModelName, string> = {
  model: "var(--chart-1)",
  baseline_prev_day: "var(--chart-3)",
  baseline_prev_week: "var(--chart-4)",
};
function steps() {
  return [
    { icon: History, title: t("Recent prices"), text: t("Yesterday and earlier") },
    { icon: Zap, title: t("Demand forecast"), text: t("Published before the cutoff") },
    { icon: CloudSun, title: t("Weather forecast"), text: t("Six places in Germany") },
    { icon: Calculator, title: t("Three estimates"), text: t("Low, middle and high") },
  ];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader title={t("Model")} />
      {children}
    </div>
  );
}

function Widget({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Card size="sm" className={cn("min-w-0 gap-3", className)}>
      <CardContent className="flex h-full flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function maeRows(group: Record<string, ScoreSet>) {
  return Object.entries(group).map(([key, set]) => ({
    key,
    model: set.model?.mae ?? null,
    baseline_prev_day: set.baseline_prev_day?.mae ?? null,
    baseline_prev_week: set.baseline_prev_week?.mae ?? null,
  }));
}

function MaeTable({ head, rows }: { head: string; rows: ReturnType<typeof maeRows> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{head}</TableHead>
          {MODELS.map((m) => (
            <TableHead key={m} className="text-right">{modelLabel(m)}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell>{r.key}</TableCell>
            {MODELS.map((m) => (
              <TableCell key={m} className="text-right tabular-nums">{fmt(r[m])}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function shortRegime(key: string): string {
  const high = key.match(/^extreme_high_top5pct_ge_(-?[\d.]+)$/);
  if (high) return t("Top 5% of prices");
  const low = key.match(/^extreme_low_bottom5pct_le_(-?[\d.]+)$/);
  if (low) return t("Bottom 5% of prices");
  return (
    { negative_price: t("Negative prices"), normal_middle90pct: t("Middle 90%"), dst_change_days: t("Clock-change days") }[key] ??
    regimeLabel(key)
  );
}

function HowItWorks() {
  return (
    <Widget className="md:col-span-2 xl:col-span-7">
      <WidgetTitle>{t("How it works")}</WidgetTitle>
      <ol className="grid flex-1 gap-3 sm:grid-cols-2">
        {steps().map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-2 text-sm">
        <Gauge className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {t("Every forecast is made by 11:30 Berlin time, before the 12:00 auction closes.")}
      </p>
    </Widget>
  );
}

function Details({ report }: { report: BacktestFile | null }) {
  return (
    <Card size="sm" className="min-w-0 py-1">
      <CardContent>
        <Accordion type="multiple">
          {report && (
            <AccordionItem value="metrics">
              <AccordionTrigger>{t("All backtest metrics")}</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="rounded-2xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Forecast")}</TableHead>
                        <TableHead className="text-right">MAE</TableHead>
                        <TableHead className="text-right">RMSE</TableHead>
                        <TableHead className="text-right">sMAPE</TableHead>
                        <TableHead className="text-right">{t("P10–P90 coverage")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MODELS.map((m) => {
                        const s = report.overall[m];
                        return (
                          <TableRow key={m}>
                            <TableCell>{modelLabel(m)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s?.mae)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s?.rmse)}</TableCell>
                            <TableCell className="text-right tabular-nums">{pct(s?.smape)}</TableCell>
                            <TableCell className="text-right tabular-nums">{pct(s?.coverage_p10_p90)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-muted-foreground">
                  {t("MAE and RMSE are in EUR/MWh. sMAPE is unstable near zero prices, so read it alongside MAE. Baseline ranges come from their own errors over the previous 90 days. Difference from the model, with a 95% interval from resampling whole days:")}{" "}
                  {(["baseline_prev_day", "baseline_prev_week"] as const)
                    .map((b) => {
                      const s = report.significance[b];
                      return `${modelLabel(b)}: ${fmt(s.mae_difference_model_minus_baseline)} (${t("{low} to {high}", { low: fmt(s.ci95_low), high: fmt(s.ci95_high) })})`;
                    })
                    .join("; ")}
                  .{" "}
                  {t("Trained from {start}, retrained monthly with an expanding window. Run on {run}. Version {version}.", { start: dateLabel(report.train_start), run: dateTimeLabel(report.generated_at_utc), version: report.model_version })}
                </p>
              </AccordionContent>
            </AccordionItem>
          )}
          {report?.calibration && (
            <AccordionItem value="calibration">
              <AccordionTrigger>{t("How the range is calibrated")}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t("The raw P10–P90 range covered only {coverage} of prices, so each month it is widened or narrowed using errors from the previous {days} days. This was added after seeing that first result, so the calibrated coverage may be slightly flattering. It does not change P50 or MAE.", { coverage: pct(report.calibration.coverage_before), days: report.calibration.holdout_days })}
              </AccordionContent>
            </AccordionItem>
          )}
          <AccordionItem value="fail">
            <AccordionTrigger>{t("Where it can fail")}</AccordionTrigger>
            <AccordionContent>
              <ul className="grid gap-3 text-muted-foreground md:grid-cols-2">
                <li><strong className="font-medium text-foreground">{t("Sudden shocks.")}</strong> {t("Plant outages, fuel price jumps and cross-border events aren't in its inputs.")}</li>
                <li><strong className="font-medium text-foreground">{t("Extreme prices.")}</strong> {t("Very high and very negative prices are rare, so there are few examples to learn from.")}</li>
                <li><strong className="font-medium text-foreground">{t("Weather errors.")}</strong> {t("A wrong wind or solar forecast carries straight through to the price forecast.")}</li>
                <li><strong className="font-medium text-foreground">{t("Hourly detail.")}</strong> {t("The market clears every 15 minutes, but this model forecasts hourly averages.")}</li>
                <li><strong className="font-medium text-foreground">{t("Backtest optimism.")}</strong> {t("Early archived weather comes from a newer model version than was running at the time.")}</li>
                <li><strong className="font-medium text-foreground">{t("Left-out data.")}</strong> {t("Delivery-day wind and solar forecasts appear to arrive after the auction closes, so they aren't used.")}</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

export function ModelView() {
  const state = useData<BacktestFile>("backtest.json");
  useEntranceWindow(state.status !== "loading");
  if (state.status === "loading") {
    return (
      <Shell>
        <GridSkeleton
          cells={[
            "h-60 xl:col-span-4",
            "h-60 xl:col-span-5",
            "h-60 md:col-span-2 xl:col-span-3",
            "h-[404px] md:col-span-2 xl:col-span-8",
            "h-[404px] md:col-span-2 xl:col-span-4",
            "h-[404px] md:col-span-2 xl:col-span-7",
            "h-[404px] md:col-span-2 xl:col-span-5",
          ]}
        />
      </Shell>
    );
  }
  if (state.status === "error") return <Shell><ErrorState message={state.message} /></Shell>;
  if (state.status === "empty") {
    return (
      <Shell>
        <EmptyState title={t("Backtest results are not available yet")}>
          {t("They appear here once the walk-forward backtest has been run on real data.")}
        </EmptyState>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7"><HowItWorks /></div>
        <Details report={null} />
      </Shell>
    );
  }

  const d = state.data;
  const hourRows = maeRows(d.by_hour).sort((a, b) => Number(a.key) - Number(b.key));
  const monthRows = maeRows(d.by_month).sort((a, b) => a.key.localeCompare(b.key));
  const importance = Object.entries(d.feature_importance)
    .slice(0, 8)
    .map(([key, share]) => ({ name: featureLabel(key), share: share * 100 }));
  const worstHour = [...hourRows].sort((a, b) => (b.model ?? 0) - (a.model ?? 0))[0];
  // When the bottom 5% is exactly the negative-price hours, showing both would repeat one row.
  const negative = d.by_regime.negative_price?.model;
  const regimes = Object.entries(d.by_regime).filter(
    ([key, set]) =>
      set.model &&
      key !== "all" &&
      !(
        key.startsWith("extreme_low") &&
        negative?.n === set.model.n &&
        negative?.mae === set.model.mae
      ),
  );
  const m = d.overall.model;
  const previous = d.overall.baseline_prev_day;
  const change = m && previous ? 100 * (1 - m.mae / previous.mae) : null;
  const coverage = m?.coverage_p10_p90 ?? 0;
  const verdicts = Object.values(d.significance).map((s) => s.verdict);
  const beatBoth = verdicts.every((v) => v === "model better");
  const lost = verdicts.some((v) => v === "baseline better");
  const verdictLabel = beatBoth ? t("Beat both baselines") : lost ? t("Lost to a baseline") : t("No clear winner");

  return (
    <Shell>
      {d.is_sample && <SampleBanner />}
      <div className="entrance grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <Card size="sm" className="min-w-0 gap-0 bg-accent text-accent-foreground xl:col-span-4">
          <CardContent className="flex h-full flex-col gap-4">
            <div className="flex min-h-7 items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{t("Average error")}</h2>
              <span className="rounded-full bg-accent-foreground px-2 py-0.5 text-xs font-medium text-accent">{t("Backtest")}</span>
            </div>
            <p className="font-heading text-6xl tracking-tight tabular-nums">
              {m ? <CountUp value={m.mae} format={fmt} /> : t("n/a")}
              <span className="ml-2 text-sm tracking-normal">EUR/MWh</span>
            </p>
            {change !== null && (
              <p className="text-sm">
                {t(change >= 0 ? "{pct} lower than the previous-day baseline" : "{pct} higher than the previous-day baseline", { pct: pct(Math.abs(change), 0) })}
              </p>
            )}
            <p className="mt-auto text-xs">
              {t("{n} simulated days, {from} to {to}. Not live results.", { n: d.days_scored, from: dateLabel(d.test_start), to: dateLabel(d.test_end) })}
            </p>
          </CardContent>
        </Card>

        <Widget className="xl:col-span-5">
          <WidgetTitle action={<Badge variant={lost ? "destructive" : "secondary"}>{verdictLabel}</Badge>}>
            {t("Model vs. baselines")}
          </WidgetTitle>
          <ComparisonBars
            data={MODELS.map((name) => ({ name: modelLabel(name), value: d.overall[name]?.mae ?? 0, color: COLORS[name] }))}
          />
          <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {MODELS.map((name) => (
              <li key={name} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: COLORS[name] }} aria-hidden />
                {modelLabel(name)}
              </li>
            ))}
          </ul>
        </Widget>

        <Widget className="md:col-span-2 xl:col-span-3">
          <WidgetTitle>{t("Range coverage")}</WidgetTitle>
          <p className="font-heading text-4xl tracking-tight tabular-nums">{pct(coverage)}</p>
          <div
            className="relative h-3 rounded-full bg-muted"
            role="img"
            aria-label={t("P10 to P90 coverage {value} percent, target 80 percent", { value: fmt(coverage, 1) })}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, coverage)}%` }} />
            <span className="absolute -top-1 -bottom-1 left-[80%] w-0.5 rounded-full bg-foreground" aria-hidden />
          </div>
          <p className="text-xs text-muted-foreground">{t("Target 80%, marked on the bar")}</p>
          {d.calibration && (
            <p className="mt-auto rounded-2xl bg-muted p-3 text-xs">
              {t("{value} before calibration", { value: pct(d.calibration.coverage_before) })}
            </p>
          )}
        </Widget>

        <Widget className="md:col-span-2 xl:col-span-8">
          <Tabs defaultValue="hour" className="min-w-0 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <WidgetTitle>{t("Error over time")}</WidgetTitle>
              <TabsList aria-label={t("{label}: choose a view", { label: t("Error over time") })}>
                <TabsTrigger value="hour">{t("By hour")}</TabsTrigger>
                <TabsTrigger value="month">{t("By month")}</TabsTrigger>
                <TabsTrigger value="table">{t("Table")}</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="hour" className="min-w-0">
              <SeriesLineChart data={hourRows} xKey="key" unit="EUR/MWh" series={series()} />
            </TabsContent>
            <TabsContent value="month" className="min-w-0">
              <SeriesLineChart data={monthRows} xKey="key" unit="EUR/MWh" series={series()} />
            </TabsContent>
            <TabsContent value="table" className="min-w-0">
              <div className="h-72 space-y-3 overflow-auto rounded-2xl border" tabIndex={0} role="region" aria-label={t("{label}, data table", { label: t("Error over time") })}>
                <MaeTable head={t("Berlin hour")} rows={hourRows} />
                <MaeTable head={t("Month")} rows={monthRows} />
              </div>
            </TabsContent>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            {t("MAE in EUR/MWh. Largest model errors at {hour}:00 Berlin time.", { hour: worstHour?.key ?? "" })}
          </p>
        </Widget>

        <Widget className="md:col-span-2 xl:col-span-4">
          <WidgetTitle>{t("Unusual prices")}</WidgetTitle>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs text-muted-foreground">
            <span>{t("Period")}</span>
            <span className="text-right">MAE</span>
            <span className="w-14 text-right">{t("In range")}</span>
          </div>
          <ul className="flex-1 divide-y text-sm">
            {regimes.map(([key, set]) => (
              <li key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-2.5" title={regimeLabel(key)}>
                <span className="min-w-0">{shortRegime(key)}</span>
                <span className="font-heading text-base tabular-nums">{fmt(set.model?.mae, 1)}</span>
                <span className="w-14 text-right tabular-nums text-muted-foreground">{pct(set.model?.coverage_p10_p90, 0)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("Model only. Grouped by actual price, after the fact.")}</p>
        </Widget>

        <HowItWorks />

        <Widget className="md:col-span-2 xl:col-span-5">
          <WidgetTitle>{t("What it relies on most")}</WidgetTitle>
          <ImportanceChart data={importance} />
          <p className="text-xs text-muted-foreground">
            {t("Share of split gain, top {n} of {total}. Not proof of what moves prices.", { n: importance.length, total: d.n_features })}
          </p>
        </Widget>
      </div>
      <Details report={d} />
    </Shell>
  );
}

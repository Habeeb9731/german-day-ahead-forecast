"use client";

import { CheckCircle2, Scale, XCircle } from "lucide-react";

import { ChartOrTable } from "@/components/chart-or-table";
import { ImportanceChart } from "@/components/charts/importance-chart";
import { SeriesLineChart } from "@/components/charts/series-line-chart";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SampleBanner,
} from "@/components/page-states";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { featureLabel, fmt, MODEL_LABELS, regimeLabel } from "@/lib/labels";
import { dateLabel, dateTimeLabel } from "@/lib/time";
import type { BacktestFile, ModelName, ScoreSet, Significance } from "@/lib/types";
import { useData } from "@/lib/use-data";

const MODELS: ModelName[] = ["model", "baseline_prev_day", "baseline_prev_week"];
const SERIES = [
  { key: "model", label: MODEL_LABELS.model, color: "var(--chart-1)" },
  { key: "baseline_prev_day", label: MODEL_LABELS.baseline_prev_day, color: "var(--chart-3)", dashed: true },
  { key: "baseline_prev_week", label: MODEL_LABELS.baseline_prev_week, color: "var(--chart-4)", dashed: true },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader title="Model">
        How the model works, how it performed in a backtest, and where it falls short.
      </PageHeader>
      {children}
    </div>
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
            <TableHead key={m} className="text-right">{MODEL_LABELS[m]}</TableHead>
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

function Verdict({ name, s }: { name: "baseline_prev_day" | "baseline_prev_week"; s: Significance }) {
  const Icon = s.verdict === "model better" ? CheckCircle2 : s.verdict === "baseline better" ? XCircle : Scale;
  const title =
    s.verdict === "model better"
      ? `The model beat “${MODEL_LABELS[name]}”`
      : s.verdict === "baseline better"
        ? `The model lost to “${MODEL_LABELS[name]}”`
        : `No clear winner against “${MODEL_LABELS[name]}”`;
  const delta = s.mae_difference_model_minus_baseline;
  return (
    <Alert variant={s.verdict === "baseline better" ? "destructive" : "default"}>
      <Icon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        Its MAE was {fmt(Math.abs(delta))} EUR/MWh {delta < 0 ? "lower" : "higher"} (95% interval for
        the difference: {fmt(s.ci95_low)} to {fmt(s.ci95_high)}, resampling whole days).
      </AlertDescription>
    </Alert>
  );
}

export function ModelView() {
  const state = useData<BacktestFile>("backtest.json");
  if (state.status === "loading") return <Shell><LoadingState /></Shell>;
  if (state.status === "error") return <Shell><ErrorState message={state.message} /></Shell>;
  const explanation = <Explanation />;
  if (state.status === "empty") {
    return (
      <Shell>
        <EmptyState title="Backtest results are not available yet">
          They appear here once the walk-forward backtest has been run on real data.
        </EmptyState>
        {explanation}
      </Shell>
    );
  }

  const d = state.data;
  const hourRows = maeRows(d.by_hour).sort((a, b) => Number(a.key) - Number(b.key));
  const monthRows = maeRows(d.by_month).sort((a, b) => a.key.localeCompare(b.key));
  const importance = Object.entries(d.feature_importance)
    .slice(0, 15)
    .map(([key, share]) => ({ name: featureLabel(key), share: share * 100 }));
  const worstHour = [...hourRows].sort((a, b) => (b.model ?? 0) - (a.model ?? 0))[0];
  const regimes = Object.entries(d.by_regime).filter(([, set]) => set.model);

  return (
    <Shell>
      {d.is_sample && <SampleBanner />}
      <div className="grid gap-4 sm:grid-cols-3">
        {MODELS.map((m) => (
          <StatCard
            key={m}
            accent={m === "model"}
            label={`${MODEL_LABELS[m]}, MAE`}
            value={fmt(d.overall[m]?.mae)}
            unit="EUR/MWh"
            detail={`P10–P90 coverage ${fmt(d.overall[m]?.coverage_p10_p90, 1)}% (target 80%)`}
          />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Backtest results</CardTitle>
          <CardDescription>
            Walk-forward test on {d.days_scored} days, {dateLabel(d.test_start)} to{" "}
            {dateLabel(d.test_end)}. These are simulated past forecasts, not live results. Retrained{" "}
            {d.retrain}. Run on {dateTimeLabel(d.generated_at_utc)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Forecast</TableHead>
                  <TableHead className="text-right">MAE</TableHead>
                  <TableHead className="text-right">RMSE</TableHead>
                  <TableHead className="text-right">sMAPE</TableHead>
                  <TableHead className="text-right">P10–P90 coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODELS.map((m) => {
                  const s = d.overall[m];
                  return (
                    <TableRow key={m}>
                      <TableCell>{MODEL_LABELS[m]}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s?.mae)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s?.rmse)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s?.smape, 1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s?.coverage_p10_p90, 1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            MAE and RMSE are in EUR/MWh. The P10–P90 target is 80%. Baselines give single numbers, so
            their ranges come from their own errors over the previous 90 days. sMAPE is unstable when
            prices are near zero, so read it alongside MAE.
          </p>
          {d.calibration && (
            <p className="text-sm text-muted-foreground">
              The model&apos;s raw P10–P90 range covered only {fmt(d.calibration.coverage_before, 1)}% of
              prices, so each month it is recalibrated using errors from the previous{" "}
              {d.calibration.holdout_days} days. The method was added after seeing that first result, so
              the calibrated coverage above may be slightly flattering. It does not change P50 or MAE.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <Verdict name="baseline_prev_day" s={d.significance.baseline_prev_day} />
            <Verdict name="baseline_prev_week" s={d.significance.baseline_prev_week} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>MAE by hour of day</CardTitle>
            <CardDescription>
              EUR/MWh, Europe/Berlin. The model&apos;s largest errors are at {worstHour?.key}:00.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartOrTable
              label="MAE by hour of day"
              chart={<SeriesLineChart data={hourRows} xKey="key" unit="EUR/MWh" series={SERIES} />}
              table={<MaeTable head="Hour" rows={hourRows} />}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>MAE by month</CardTitle>
            <CardDescription>EUR/MWh.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartOrTable
              label="MAE by month"
              chart={<SeriesLineChart data={monthRows} xKey="key" unit="EUR/MWh" series={SERIES} />}
              table={<MaeTable head="Month" rows={monthRows} />}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Errors in unusual price periods</CardTitle>
          <CardDescription>
            These slices are chosen using actual prices, after the fact, to show where forecasts
            struggle. P10–P90 coverage is for the model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  {MODELS.map((m) => (
                    <TableHead key={m} className="text-right">{MODEL_LABELS[m]}</TableHead>
                  ))}
                  <TableHead className="text-right">Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regimes.map(([key, set]) => (
                  <TableRow key={key}>
                    <TableCell className="whitespace-normal">{regimeLabel(key)}</TableCell>
                    <TableCell className="text-right tabular-nums">{set.model?.n}</TableCell>
                    {MODELS.map((m) => (
                      <TableCell key={m} className="text-right tabular-nums">{fmt(set[m]?.mae)}</TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{fmt(set.model?.coverage_p10_p90, 1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the model relies on most</CardTitle>
          <CardDescription>
            Share of split gain, top {importance.length} of {d.n_features} features. This shows what
            the model uses, not what causes prices to move.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartOrTable
            label="Feature importance"
            chart={<ImportanceChart data={importance} />}
            table={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importance.map((f) => (
                    <TableRow key={f.name}>
                      <TableCell className="whitespace-normal">{f.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(f.share, 1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          />
        </CardContent>
      </Card>

      {explanation}
      <p className="text-xs text-muted-foreground">Model version {d.model_version}.</p>
    </Shell>
  );
}

function Explanation() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Each morning by 11:30 Berlin time, half an hour before the auction closes, the model predicts
            every hour of the next day using only what was already public.
          </p>
          <p>
            It looks at recent prices, the official demand forecast, the calendar and holidays, and a
            weather forecast for six places across Germany. Wind and sun matter because they push
            cheaper power onto the grid.
          </p>
          <p>
            It is a set of gradient-boosted decision trees (LightGBM). Three versions give a low (P10),
            middle (P50) and high (P90) estimate, which form the range on the chart.
          </p>
          <p>
            Grid operators&apos; wind and solar forecasts for the delivery day are left out, because
            they are published after the auction closes. Using them would flatter the backtest.
          </p>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Where it can fail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong className="font-medium">Sudden shocks.</strong> Plant outages, fuel price jumps and
            cross-border events aren&apos;t in its inputs, so it can only react through later prices.
          </p>
          <p>
            <strong className="font-medium">Extreme prices.</strong> Very high and very negative prices
            are rare, leaving few examples to learn from. The table above shows the size of this effect.
          </p>
          <p>
            <strong className="font-medium">Weather errors.</strong> A wrong wind or solar forecast
            carries straight through to the price forecast.
          </p>
          <p>
            <strong className="font-medium">Hourly detail.</strong> The market now clears every 15
            minutes, but this model forecasts hourly averages, so it misses swings within an hour.
          </p>
          <p>
            <strong className="font-medium">Backtest optimism.</strong> Early archived weather forecasts
            come from a newer model version than was running at the time, which may flatter results.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

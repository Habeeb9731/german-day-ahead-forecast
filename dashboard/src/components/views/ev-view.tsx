"use client";

import { Info } from "lucide-react";
import { useMemo, useState } from "react";

import { ChartOrTable } from "@/components/chart-or-table";
import { EvChart } from "@/components/charts/ev-chart";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SampleBanner,
  StaleBanner,
  WidgetTitle,
} from "@/components/page-states";
import { CountUp } from "@/components/count-up";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cheapestSchedule, eurMwhToCtKwh } from "@/lib/ev";
import { intlLocale, t } from "@/lib/i18n";
import { eur, fmt } from "@/lib/labels";
import { dateLabel, hourLabel, isForecastStale } from "@/lib/time";
import type { ForecastHour, TomorrowFile, TrackRecordFile } from "@/lib/types";
import { useData } from "@/lib/use-data";
import { useEntranceWindow } from "@/lib/use-entrance";

const CHARGERS = [3.7, 7.4, 11, 22];
const MAX_KWH = 120;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader title={t("EV charging")} />
      {children}
    </div>
  );
}

export function EvView() {
  const state = useData<TomorrowFile>("tomorrow.json");
  const history = useData<TrackRecordFile>("backtest_recent.json");
  useEntranceWindow(state.status !== "loading" && (state.status !== "empty" || history.status !== "loading"));
  if (state.status === "loading" || (state.status === "empty" && history.status === "loading")) {
    return <Shell><LoadingState /></Shell>;
  }
  if (state.status === "error") return <Shell><ErrorState message={state.message} /></Shell>;

  if (state.status === "empty") {
    const rows = history.status === "ready" ? history.data.hours : [];
    if (rows.length === 0) {
      return (
        <Shell>
          <EmptyState title={t("No forecast to plan with yet")}>
            {t("The calculator works once a forecast for tomorrow has been published.")}
          </EmptyState>
        </Shell>
      );
    }
    const date = rows[rows.length - 1].delivery_date;
    return (
      <Shell>
        <Calculator
          hours={rows.filter((h) => h.delivery_date === date)}
          date={date}
          isExample
          isSample={history.status === "ready" && history.data.is_sample}
        />
      </Shell>
    );
  }
  if (state.data.status !== "ok" || state.data.hours.length === 0) {
    return (
      <Shell>
        <StaleBanner>
          {t("No forecast was produced for {date}, so there is no schedule to show.", { date: dateLabel(state.data.delivery_date) })}
        </StaleBanner>
      </Shell>
    );
  }
  return (
    <Shell>
      <Calculator hours={state.data.hours} date={state.data.delivery_date} isSample={state.data.is_sample} />
    </Shell>
  );
}

function Calculator({
  hours,
  date,
  isExample = false,
  isSample,
}: {
  hours: ForecastHour[];
  date: string;
  isExample?: boolean;
  isSample: boolean;
}) {
  const [energy, setEnergy] = useState(40);
  const [power, setPower] = useState(11);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(hours.length);
  const isDstDay = hours.length !== 24;

  const endLabel = (index: number) =>
    index >= hours.length ? "24:00" : hourLabel(hours[index].valid_from_utc, isDstDay);

  const result = useMemo(
    () => cheapestSchedule({ hours, energyKwh: energy, powerKw: power, windowStart: start, windowEnd: end }),
    [hours, energy, power, start, end],
  );
  const stale = !isExample && isForecastStale(date, new Date());

  const bars = hours.map((h) => {
    const price = eurMwhToCtKwh(h.p50);
    const on = result.feasible && result.slots.some((s) => s.valid_from_utc === h.valid_from_utc);
    return {
      label: hourLabel(h.valid_from_utc, isDstDay),
      charging: on ? price : null,
      idle: on ? null : price,
    };
  });

  return (
    <div className="space-y-3">
      {isSample && <SampleBanner />}
      {stale && (
        <StaleBanner>
          {t("The latest forecast is for {date}, and a newer one should exist by now. Do not use this schedule for a later day.", { date: dateLabel(date) })}
        </StaleBanner>
      )}
      <div className="entrance grid gap-3 xl:grid-cols-12">
        <Card size="sm" className="min-w-0 xl:col-span-4 xl:row-span-2">
          <CardContent className="flex h-full flex-col gap-5">
            <WidgetTitle action={<Badge variant={isExample ? "outline" : "secondary"} className={isExample ? "border-chart-4" : undefined}>{t(isExample ? "Backtest example: {date}" : "Tomorrow: {date}", { date: dateLabel(date) })}</Badge>}>
              {t("Your charge")}
            </WidgetTitle>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="energy">{t("Energy needed (kWh)")}</Label>
                <Input
                  id="energy"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={MAX_KWH}
                  className="w-24 text-right tabular-nums"
                  value={Number.isNaN(energy) ? "" : energy}
                  onChange={(e) => setEnergy(e.target.valueAsNumber)}
                />
              </div>
              <Slider
                aria-label={t("Energy needed in kilowatt-hours")}
                min={1}
                max={MAX_KWH}
                step={1}
                value={[Number.isNaN(energy) ? 1 : Math.min(energy, MAX_KWH)]}
                onValueChange={([v]) => setEnergy(v)}
              />
            </div>
            <div className="space-y-2">
              <p id="power-label" className="text-sm font-medium">{t("Charger power")}</p>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="power-label"
                value={String(power)}
                onValueChange={(v) => v && setPower(Number(v))}
                className="flex-wrap"
              >
                {CHARGERS.map((c) => (
                  <ToggleGroupItem key={c} value={String(c)} className="px-3">{c.toLocaleString(intlLocale())} kW</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start">{t("Plugged in")}</Label>
                <Select value={String(start)} onValueChange={(v) => setStart(Number(v))}>
                  <SelectTrigger id="start" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {hours.map((h, i) => (
                      <SelectItem key={h.valid_from_utc} value={String(i)} disabled={i >= end}>
                        {hourLabel(h.valid_from_utc, isDstDay)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">{t("Done by")}</Label>
                <Select value={String(end)} onValueChange={(v) => setEnd(Number(v))}>
                  <SelectTrigger id="end" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {hours.map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)} disabled={i + 1 <= start}>
                        {endLabel(i + 1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="mt-auto flex gap-2 rounded-2xl bg-muted p-3 text-xs">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              {t("Uses wholesale prices and excludes taxes, grid fees and supplier charges.")}
            </p>
          </CardContent>
        </Card>

        {!result.feasible ? (
          <Alert variant="destructive" className="xl:col-span-8">
            <AlertTitle>
              {result.reason === "window_too_short" ? t("This window is too short") : t("Check your inputs")}
            </AlertTitle>
            <AlertDescription>
              {result.reason === "window_too_short"
                ? t("At {kw} kW, this window delivers at most {kwh} kWh.", { kw: power.toLocaleString(intlLocale()), kwh: fmt(result.maxKwh, 1) })
                : t("Enter an energy amount above zero and a window at least an hour long.")}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Card size="sm" className="min-w-0 bg-accent text-accent-foreground xl:col-span-4">
              <CardContent className="flex h-full flex-col gap-2">
                <h2 className="text-sm font-medium">{t("Estimated saving")}</h2>
                <p className="font-heading text-6xl tracking-tight tabular-nums">
                  {result.savingsEur === null ? t("n/a") : <CountUp value={result.savingsEur} format={eur} />}
                </p>
                <p className="mt-auto text-xs">
                  {result.savingsEur === null ? t("This charge would not finish if started at 18:00.") : t("Compared with charging from 18:00")}
                </p>
              </CardContent>
            </Card>
            <div className="grid min-w-0 grid-cols-2 gap-3 xl:col-span-4">
              <Card size="sm" className="min-w-0 gap-1">
                <CardContent className="flex h-full flex-col gap-1">
                  <p className="text-xs text-muted-foreground">{t("Cheapest hours")}</p>
                  <p className="font-heading text-3xl tracking-tight tabular-nums">{eur(result.costEur)}</p>
                  <p className="mt-auto text-xs text-muted-foreground tabular-nums">{fmt(result.averageCtPerKwh)} ct/kWh</p>
                </CardContent>
              </Card>
              <Card size="sm" className="min-w-0 gap-1">
                <CardContent className="flex h-full flex-col gap-1">
                  <p className="text-xs text-muted-foreground">{t("From 18:00")}</p>
                  <p className="font-heading text-3xl tracking-tight tabular-nums">{result.sixPm ? eur(result.sixPm.costEur) : t("n/a")}</p>
                  <p className="mt-auto text-xs text-muted-foreground tabular-nums">
                    {result.sixPm ? `${fmt(result.sixPm.averageCtPerKwh)} ct/kWh` : t("Would not finish")}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card size="sm" className="min-w-0 gap-3 xl:col-span-8">
              <CardContent className="flex h-full flex-col gap-3">
                <WidgetTitle>{t("Charging schedule")}</WidgetTitle>
                <ChartOrTable
                  label={t("Charging schedule")}
                  chart={<EvChart data={bars} />}
                  table={
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("Hour")}</TableHead>
                          <TableHead className="text-right">{t("Energy (kWh)")}</TableHead>
                          <TableHead className="text-right">{t("Price (ct/kWh)")}</TableHead>
                          <TableHead className="text-right">{t("Cost (€)")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.slots.map((s) => (
                          <TableRow key={s.valid_from_utc}>
                            <TableCell>{hourLabel(s.valid_from_utc, isDstDay)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s.kwh)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s.ctPerKwh)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(s.costEur)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  }
                />
                <p className="text-sm">
                  {t("Charge at {hours}.", { hours: result.slots.map((s) => hourLabel(s.valid_from_utc, isDstDay)).join(", ") })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("Between {low} and {high} if every hour lands at its P10 or P90 price.", { low: eur(result.costLowEur), high: eur(result.costHighEur) })}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

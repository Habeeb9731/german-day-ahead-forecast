"use client";

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
} from "@/components/page-states";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cheapestSchedule, eurMwhToCtKwh } from "@/lib/ev";
import { eur, fmt } from "@/lib/labels";
import { dateLabel, hourLabel, isForecastStale } from "@/lib/time";
import type { ForecastHour, TomorrowFile } from "@/lib/types";
import { useData } from "@/lib/use-data";

const CHARGERS = [3.7, 7.4, 11, 22];
const MAX_KWH = 120;

function Disclaimer() {
  return (
    <Alert>
      <AlertTitle>Wholesale prices only</AlertTitle>
      <AlertDescription>
        This uses forecast wholesale prices and excludes taxes, grid fees and supplier charges, so
        your bill will be higher. Actual savings depend on having a dynamic tariff.
      </AlertDescription>
    </Alert>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <PageHeader title="EV charging">
        Find the cheapest hours to charge tomorrow, and compare them with plugging in at 18:00.
      </PageHeader>
      <Disclaimer />
      {children}
    </div>
  );
}

export function EvView() {
  const state = useData<TomorrowFile>("tomorrow.json");
  if (state.status === "loading") return <Shell><LoadingState /></Shell>;
  if (state.status === "error") return <Shell><ErrorState message={state.message} /></Shell>;
  if (state.status === "empty" || state.data.hours.length === 0) {
    return (
      <Shell>
        <EmptyState title="No forecast to plan with yet">
          The calculator works once a forecast for tomorrow has been published.
        </EmptyState>
      </Shell>
    );
  }
  return <Shell><Calculator data={state.data} hours={state.data.hours} /></Shell>;
}

function Calculator({ data, hours }: { data: TomorrowFile; hours: ForecastHour[] }) {
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
  const stale = isForecastStale(data.delivery_date, new Date());

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
    <div className="space-y-4">
      {data.is_sample && <SampleBanner />}
      {stale && (
        <StaleBanner>
          The latest forecast is for {dateLabel(data.delivery_date)}, and a newer one should exist by
          now. Do not use this schedule for a later day.
        </StaleBanner>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Your charge</CardTitle>
          <CardDescription>
            For {dateLabel(data.delivery_date)}, Europe/Berlin. Prices are only known one day ahead,
            so the plug-in window has to fall within this day.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-3">
            <Label htmlFor="energy">Energy needed (kWh)</Label>
            <Input
              id="energy"
              type="number"
              inputMode="decimal"
              min={1}
              max={MAX_KWH}
              value={Number.isNaN(energy) ? "" : energy}
              onChange={(e) => setEnergy(e.target.valueAsNumber)}
            />
            <Slider
              aria-label="Energy needed in kilowatt-hours"
              min={1}
              max={MAX_KWH}
              step={1}
              value={[Number.isNaN(energy) ? 1 : Math.min(energy, MAX_KWH)]}
              onValueChange={([v]) => setEnergy(v)}
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="power">Charger power</Label>
            <Select value={String(power)} onValueChange={(v) => setPower(Number(v))}>
              <SelectTrigger id="power" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHARGERS.map((c) => (
                  <SelectItem key={c} value={String(c)}>{c} kW</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label htmlFor="start">Plugged in from</Label>
            <Select value={String(start)} onValueChange={(v) => setStart(Number(v))}>
              <SelectTrigger id="start" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map((h, i) => (
                  <SelectItem key={h.valid_from_utc} value={String(i)} disabled={i >= end}>
                    {hourLabel(h.valid_from_utc, isDstDay)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label htmlFor="end">Must be finished by</Label>
            <Select value={String(end)} onValueChange={(v) => setEnd(Number(v))}>
              <SelectTrigger id="end" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map((_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)} disabled={i + 1 <= start}>
                    {endLabel(i + 1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!result.feasible ? (
        <Alert variant="destructive">
          <AlertTitle>
            {result.reason === "window_too_short" ? "This window is too short" : "Check your inputs"}
          </AlertTitle>
          <AlertDescription>
            {result.reason === "window_too_short"
              ? `At ${power} kW, this window can deliver at most ${fmt(result.maxKwh, 1)} kWh. Lower the energy needed or widen the window.`
              : "Enter an energy amount above zero and a window at least an hour long."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Cheapest schedule"
              value={eur(result.costEur)}
              detail={`${fmt(result.averageCtPerKwh)} ct/kWh on average`}
            />
            <StatCard
              label="Charging from 18:00"
              value={result.sixPm ? eur(result.sixPm.costEur) : "n/a"}
              detail={
                result.sixPm
                  ? `${fmt(result.sixPm.averageCtPerKwh)} ct/kWh on average`
                  : "Would not finish before the forecast day ends."
              }
            />
            <StatCard
              accent
              label="Estimated saving"
              value={eur(result.savingsEur)}
              detail={
                result.savingsEur === null
                  ? "No 18:00 comparison for this charge."
                  : "Compared with charging from 18:00."
              }
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Charging schedule</CardTitle>
              <CardDescription>
                Wholesale price by hour in ct/kWh, with charging hours highlighted. If every hour landed
                at its P10 or P90 price, this schedule would cost {eur(result.costLowEur)} to {eur(result.costHighEur)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartOrTable
                label="Charging schedule"
                chart={<EvChart data={bars} />}
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hour</TableHead>
                        <TableHead className="text-right">Energy (kWh)</TableHead>
                        <TableHead className="text-right">Price (ct/kWh)</TableHead>
                        <TableHead className="text-right">Cost (€)</TableHead>
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
              <p className="mt-3 text-sm text-muted-foreground">
                Charge in {result.slots.length} {result.slots.length === 1 ? "hour" : "hours"}:{" "}
                {result.slots.map((s) => hourLabel(s.valid_from_utc, isDstDay)).join(", ")}.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

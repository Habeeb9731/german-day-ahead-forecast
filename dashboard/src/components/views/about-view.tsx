"use client";

import { ArrowUpRight, CalendarDays, Clock, CloudSun, FileLock2, Scale, Target, Zap } from "lucide-react";
import Image from "next/image";

import { PageHeader, WidgetTitle } from "@/components/page-states";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t, tRich } from "@/lib/i18n";
import { useEntranceWindow } from "@/lib/use-entrance";

function sources() {
  return [
  {
    icon: Zap,
    name: "Bundesnetzagentur | SMARD.de",
    text: t("Prices, demand and generation"),
    licence: "CC BY 4.0",
    href: "https://www.smard.de/en",
    note: tRich("SMARD's {link} currently ask that wholesale prices not be reused during a licensing review.", {
      link: (
        <a key="link" className="underline underline-offset-2" href="https://www.smard.de/en/datennutzung" rel="noreferrer" target="_blank">
          {t("terms")}
        </a>
      ),
    }),
  },
  {
    icon: CloudSun,
    name: t("Weather data by Open-Meteo.com"),
    text: t("ECMWF IFS forecasts, six locations"),
    licence: "CC BY 4.0",
    href: "https://open-meteo.com/",
    note: t("No endorsement implied."),
  },
  {
    icon: CalendarDays,
    name: t("holidays package"),
    text: t("German public holidays"),
    licence: t("Open source"),
    href: "https://github.com/vacanza/holidays",
    note: t("Weighted by the share of states observing them."),
  },
  ];
}

function method() {
  return [
    { icon: Clock, title: t("11:30 cutoff"), text: t("Forecast before the 12:00 auction") },
    { icon: Target, title: t("Known data only"), text: t("Tests fail on anything newer") },
    { icon: FileLock2, title: t("Never overwritten"), text: t("Each forecast is logged once") },
    { icon: Scale, title: t("Scored in public"), text: t("Against published prices") },
  ];
}

export function AboutView() {
  useEntranceWindow(true);
  return (
    <div className="space-y-4">
      <PageHeader title={t("About")} />
      <div className="entrance grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <Card size="sm" className="relative isolate min-h-96 min-w-0 justify-center text-white sm:min-h-80 md:col-span-2 md:aspect-video xl:col-span-5 dark:ring-0">
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/images/solar-panels.jpg`}
            alt=""
            fill
            sizes="(min-width: 1280px) 42vw, 100vw"
            className="-z-20 object-cover object-bottom"
          />
          <CardContent className="w-full space-y-3">
            <p className="max-w-sm font-heading text-2xl leading-tight tracking-tight sm:text-3xl">
              {t("Tomorrow's German power prices, forecast every morning.")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild className="bg-white text-[#04154a] hover:bg-white/90 dark:bg-white dark:text-[#04154a]">
                <a href="https://github.com/Habeeb9731/german-day-ahead-forecast" rel="noreferrer" target="_blank">
                  {t("View the code")}
                  <ArrowUpRight aria-hidden />
                </a>
              </Button>
              <span className="rounded-full bg-[#04154a]/70 px-3 py-1.5 text-xs">{t("Not financial advice")}</span>
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className="min-w-0 md:col-span-2 xl:col-span-7">
          <CardContent className="flex h-full flex-col gap-3">
            <WidgetTitle>{t("Method")}</WidgetTitle>
            <ul className="grid flex-1 gap-3 sm:grid-cols-2">
              {method().map(({ icon: Icon, title, text }) => (
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
            </ul>
          </CardContent>
        </Card>

        {sources().map(({ icon: Icon, name, text, licence, href, note }) => (
          <Card key={name} size="sm" className="min-w-0 xl:col-span-4">
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-10 items-center justify-center rounded-full border">
                  <Icon className="size-4" aria-hidden />
                </span>
                <Badge variant="secondary">{licence}</Badge>
              </div>
              <div>
                <a href={href} rel="noreferrer" target="_blank" className="font-heading text-lg underline-offset-2 hover:underline">
                  {name}
                </a>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
              <p className="mt-auto text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card size="sm" className="min-w-0 py-1">
        <CardContent>
          <Accordion type="multiple">
            <AccordionItem value="limits">
              <AccordionTrigger>{t("Limitations")}</AccordionTrigger>
              <AccordionContent>
                <ul className="grid gap-3 text-muted-foreground md:grid-cols-2">
                  <li><strong className="font-medium text-foreground">{t("Hourly only.")}</strong> {t("The market has cleared every 15 minutes since 1 October 2025. Hourly values average the four quarter-hour prices.")}</li>
                  <li><strong className="font-medium text-foreground">{t("Assumed availability.")}</strong> {t("SMARD keeps no revision history, so past availability uses conservative rules.")}</li>
                  <li><strong className="font-medium text-foreground">{t("Wind and solar forecasts.")}</strong> {t("Delivery-day values appear to arrive after the auction closes, so they aren't used.")}</li>
                  <li><strong className="font-medium text-foreground">{t("Wholesale prices.")}</strong> {t("They exclude taxes, grid fees and supplier charges, so they aren't what households pay.")}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="units">
              <AccordionTrigger>{t("Units and time")}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t("Market prices are in EUR/MWh, and the EV calculator uses ct/kWh (1 EUR/MWh = 0.1 ct/kWh). Times are shown in Europe/Berlin and stored in UTC. Source values were converted, aggregated and modelled.")}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="advice">
              <AccordionTrigger>{t("Not financial advice")}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t("This is an independent research project. Forecasts can be wrong and come with no guarantee. Do not rely on them for trading, purchasing or any other financial decision.")}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

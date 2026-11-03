"use client";

import { AlertTriangle, CircleAlert, FlaskConical, Inbox } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/lib/i18n";

/** Small, regular-weight page title. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    // Next.js can write its English metadata title after this runs, so keep the translated one.
    const wanted = `${title} | depower`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
  return (
    <div className="space-y-1">
      <h1 className="font-heading text-lg font-normal">{title}</h1>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Small title with the square marker used on every widget. */
export function WidgetTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
        <span className="size-3 shrink-0 rounded-[4px] bg-accent ring-1 ring-foreground/10" aria-hidden />
        {children}
      </h2>
      {action}
    </div>
  );
}

export function LoadingState() {
  return (
    <div role="status" aria-label={t("Loading data")} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/** A placeholder in the shape of the page's grid, so nothing jumps when the content arrives. */
export function GridSkeleton({ cells }: { cells: string[] }) {
  return (
    <div role="status" aria-label={t("Loading data")} className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
      {cells.map((cell, i) => (
        <Skeleton key={i} className={`rounded-[1.75rem] ${cell}`} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Alert>
      <Inbox aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>{t("The data could not be loaded")}</AlertTitle>
      <AlertDescription>{message} {t("Reload the page to try again.")}</AlertDescription>
    </Alert>
  );
}

export function StaleBanner({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden />
      <AlertTitle>{t("This data is out of date")}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function SampleBanner() {
  return (
    <Alert className="border-chart-4">
      <FlaskConical aria-hidden />
      <AlertTitle>{t("Sample data: not real prices or results")}</AlertTitle>
      <AlertDescription>
        {t("Every number on this page is synthetic, for development only. Do not draw conclusions from it.")}
      </AlertDescription>
    </Alert>
  );
}

import { AlertTriangle, CircleAlert, FlaskConical, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function LoadingState() {
  return (
    <div role="status" aria-label="Loading data" className="space-y-4">
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
      <AlertTitle>The data could not be loaded</AlertTitle>
      <AlertDescription>{message} Reload the page to try again.</AlertDescription>
    </Alert>
  );
}

export function StaleBanner({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden />
      <AlertTitle>This data is out of date</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function SampleBanner() {
  return (
    <Alert>
      <FlaskConical aria-hidden />
      <AlertTitle>Sample data: not real prices or results</AlertTitle>
      <AlertDescription>
        Every number on this page is synthetic, for development only. Do not draw conclusions from it.
      </AlertDescription>
    </Alert>
  );
}

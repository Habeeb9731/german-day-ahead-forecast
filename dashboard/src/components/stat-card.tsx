import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  unit,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card size="sm" className={cn(accent && "bg-accent text-accent-foreground")}>
      <CardHeader>
        <CardDescription className={cn(accent && "text-accent-foreground")}>{label}</CardDescription>
        <CardTitle className="text-3xl font-normal tabular-nums group-data-[size=sm]/card:text-3xl">
          {value}
          {unit && (
            <span className={cn("ml-1.5 text-sm", accent ? "text-accent-foreground" : "text-muted-foreground")}>
              {unit}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      {detail && (
        <CardContent className={cn("text-sm", accent ? "text-accent-foreground" : "text-muted-foreground")}>
          {detail}
        </CardContent>
      )}
    </Card>
  );
}

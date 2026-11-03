import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/i18n";

/** Every chart has a data table a keyboard or screen reader user can reach with one control. */
export function ChartOrTable({
  chart,
  table,
  label,
}: {
  chart: ReactNode;
  table: ReactNode;
  label: string;
}) {
  return (
    <Tabs defaultValue="chart" className="min-w-0 gap-3">
      <TabsList aria-label={t("{label}: choose a view", { label })}>
        <TabsTrigger value="chart">{t("Chart")}</TabsTrigger>
        <TabsTrigger value="table">{t("Table")}</TabsTrigger>
      </TabsList>
      <TabsContent value="chart" className="min-w-0">
        {chart}
      </TabsContent>
      <TabsContent value="table" className="min-w-0">
        <div
          className="max-h-96 overflow-auto rounded-2xl border"
          tabIndex={0}
          role="region"
          aria-label={t("{label}, data table", { label })}
        >
          {table}
        </div>
      </TabsContent>
    </Tabs>
  );
}

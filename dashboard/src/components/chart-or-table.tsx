import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    <Tabs defaultValue="chart" className="min-w-0">
      <TabsList aria-label={`${label}: choose a view`}>
        <TabsTrigger value="chart">Chart</TabsTrigger>
        <TabsTrigger value="table">Table</TabsTrigger>
      </TabsList>
      <TabsContent value="chart" className="min-w-0">
        {chart}
      </TabsContent>
      <TabsContent value="table" className="min-w-0">
        <div
          className="max-h-96 overflow-auto rounded-md border"
          tabIndex={0}
          role="region"
          aria-label={`${label}, data table`}
        >
          {table}
        </div>
      </TabsContent>
    </Tabs>
  );
}

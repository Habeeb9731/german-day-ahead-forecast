import type { Metadata } from "next";

import { PageHeader } from "@/components/page-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "About" };

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="link" className="h-auto p-0 whitespace-normal">
      <a href={href} rel="noreferrer" target="_blank">{children}</a>
    </Button>
  );
}

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="About">Where the data comes from, how forecasts are made, and their limits.</PageHeader>
      <Alert>
        <AlertTitle>Not financial advice</AlertTitle>
        <AlertDescription>
          This is an independent research project. Forecasts can be wrong and come with no guarantee.
          Do not rely on them for trading, purchasing or any other financial decision.
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader><CardTitle>Data sources and attribution</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <strong className="font-medium">Market data:</strong> Bundesnetzagentur | SMARD.de, from{" "}
              <Ext href="https://www.smard.de/en">smard.de</Ext>, used under{" "}
              <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>. Values were
              converted, aggregated and modelled. SMARD&apos;s{" "}
              <Ext href="https://www.smard.de/en/datennutzung">data use terms</Ext> currently ask that
              wholesale price data not be reused while licensing is reviewed.
            </p>
            <p>
              <strong className="font-medium">Weather forecasts:</strong> Weather data by{" "}
              <Ext href="https://open-meteo.com/">Open-Meteo.com</Ext>, under{" "}
              <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>, from the ECMWF IFS
              model. Values were reshaped into model features. This does not imply endorsement.
            </p>
            <p>
              <strong className="font-medium">Public holidays:</strong> the open-source{" "}
              <Ext href="https://github.com/vacanza/holidays">holidays</Ext> Python package.
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader><CardTitle>Method</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Each forecast is made by 11:30 Berlin time on the day before delivery, using only data
              available by then. Automated tests fail if a feature uses anything newer.
            </p>
            <p>
              Past forecasts are never overwritten, and each keeps its generation time and model
              version. Backtest results are kept apart from live ones.
            </p>
            <p>
              Market prices are in EUR/MWh, and the EV calculator uses ct/kWh (1 EUR/MWh = 0.1 ct/kWh).
              Times are shown in Europe/Berlin and stored in UTC.
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader><CardTitle>Limitations</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Forecasts are hourly, although the market has cleared every 15 minutes since 1 October
              2025. Hourly values are the average of the four quarter-hour prices.
            </p>
            <p>
              SMARD keeps no history of revisions, so past data availability is based on conservative
              rules rather than records of each publication.
            </p>
            <p>
              Delivery-day wind and solar forecasts from grid operators are not used, because they are
              published after the auction closes.
            </p>
            <p>
              Wholesale prices exclude taxes, grid fees and supplier charges, so they are not what
              households pay.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

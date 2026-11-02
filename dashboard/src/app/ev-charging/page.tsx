import type { Metadata } from "next";

import { EvView } from "@/components/views/ev-view";

export const metadata: Metadata = { title: "EV charging" };

export default function Page() {
  return <EvView />;
}

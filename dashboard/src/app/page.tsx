import type { Metadata } from "next";

import { TomorrowView } from "@/components/views/tomorrow-view";

export const metadata: Metadata = { title: "Tomorrow" };

export default function Page() {
  return <TomorrowView />;
}

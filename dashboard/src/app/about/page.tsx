import type { Metadata } from "next";

import { AboutView } from "@/components/views/about-view";

export const metadata: Metadata = { title: "About" };

export default function Page() {
  return <AboutView />;
}

import type { Metadata } from "next";

import { ModelView } from "@/components/views/model-view";

export const metadata: Metadata = { title: "Model" };

export default function Page() {
  return <ModelView />;
}

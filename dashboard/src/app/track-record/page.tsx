import type { Metadata } from "next";

import { TrackRecordView } from "@/components/views/track-record-view";

export const metadata: Metadata = { title: "Track record" };

export default function Page() {
  return <TrackRecordView />;
}

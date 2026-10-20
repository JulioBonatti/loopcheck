import type { Metadata } from "next";
import { ComingSoon } from "@/components/project/coming-soon";

export const metadata: Metadata = { title: "Reports · LoopCheck" };

/** Built in delivery 3 (REQ-REP-01…08). */
export default function ReportsPage() {
  return <ComingSoon title="Reports" />;
}

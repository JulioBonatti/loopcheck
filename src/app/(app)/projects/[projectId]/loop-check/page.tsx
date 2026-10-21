import type { Metadata } from "next";
import { ComingSoon } from "@/components/project/coming-soon";

export const metadata: Metadata = { title: "Loop check · LoopCheck" };

/** Built in delivery 2 (REQ-LC-01…14). */
export default function LoopCheckPage() {
  return <ComingSoon title="Loop check" />;
}

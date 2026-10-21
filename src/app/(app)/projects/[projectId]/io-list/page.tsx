import type { Metadata } from "next";
import { ComingSoon } from "@/components/project/coming-soon";

export const metadata: Metadata = { title: "IO list · LoopCheck" };

/** Import and the IO list table come in steps 11–13 of this delivery. */
export default function IoListPage() {
  return <ComingSoon title="No IO list yet">Importing a CSV is coming soon.</ComingSoon>;
}

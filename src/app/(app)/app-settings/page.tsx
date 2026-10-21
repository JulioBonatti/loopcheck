import type { Metadata } from "next";
import { ComingSoon } from "@/components/project/coming-soon";

export const metadata: Metadata = { title: "App Settings · LoopCheck" };

/** User-level preferences, separate from each project's settings. Not defined yet. */
export default function AppSettingsPage() {
  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold">App Settings</h2>
      <ComingSoon title="App Settings" />
    </section>
  );
}

"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "cn";
import { roleCan } from "@/lib/permissions";
import { useProject } from "./project-context";

const TABS = [
  { segment: "loop-check", label: "Loop check" },
  { segment: "io-list", label: "IO list" },
  { segment: "reports", label: "Reports" },
  { segment: "settings", label: "Project settings" },
] as const;

/** The four project tabs (REQ-UI-03). Viewers do not see Settings (§7.6). */
export function ProjectTabs() {
  const { id, role } = useProject();
  const active = useSelectedLayoutSegment();
  const tabs = TABS.filter((t) => t.segment !== "settings" || roleCan(role, "settings.edit"));

  return (
    <nav className="-mb-px flex gap-1" aria-label="Project">
      {tabs.map((tab) => (
        <Link
          key={tab.segment}
          href={`/projects/${id}/${tab.segment}`}
          aria-current={active === tab.segment ? "page" : undefined}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.segment
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

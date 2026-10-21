"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "cn";
import { projectHref } from "@/lib/routes";

const TABS = [
  { segment: null, path: "", label: "General" },
  { segment: "members", path: "/members", label: "Members" },
  { segment: "columns", path: "/columns", label: "Columns" },
  { segment: "issue-types", path: "/issue-types", label: "Issue types" },
  { segment: "presets", path: "/presets", label: "Presets" },
  { segment: "procedures", path: "/procedures", label: "Test procedures" },
] as const;

/** Sections of Project settings, one URL each (decision of 2026-10-21). */
export function SettingsTabs({ projectId }: { projectId: string }) {
  const active = useSelectedLayoutSegment();
  const base = projectHref(projectId, "settings");
  return (
    <nav className="mb-4 flex gap-1 border-b" aria-label="Project settings">
      {TABS.map((tab) => (
        <Link
          key={tab.label}
          href={`${base}${tab.path}`}
          aria-current={active === tab.segment ? "page" : undefined}
          className={cn(
            "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors",
            active === tab.segment
              ? "border-primary text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

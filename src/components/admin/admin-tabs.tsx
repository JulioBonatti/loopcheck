"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { segment: null, href: "/admin", label: "Users" },
  { segment: "projects", href: "/admin/projects", label: "Projects" },
  { segment: "trash", href: "/admin/trash", label: "Trash" },
] as const;

/** Administration tabs; each is a URL, like the project tabs. */
export function AdminTabs() {
  const active = useSelectedLayoutSegment();
  return (
    <nav className="-mb-px flex gap-1" aria-label="Administration">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
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

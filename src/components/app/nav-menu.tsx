"use client";

import { FolderKanbanIcon, HistoryIcon, MenuIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getRecentProjectAction } from "@/app/(app)/nav-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RecentProject } from "@/server/queries/projects";

/**
 * Project navigation (REQ-UI-01), folded into the header's left corner so the
 * pages keep the full width. Opens on hover, click or keyboard. Instead of
 * listing every project, it shows the one the user changed last ("Recent").
 * Account entries live in the menu at the right corner (`AccountMenu`).
 */
export function NavMenu({ recent: initialRecent }: { recent: RecentProject | null }) {
  const [recent, setRecent] = useState(initialRecent);

  function refreshRecent(open: boolean) {
    if (open) getRecentProjectAction().then(setRecent, () => {});
  }

  return (
    <DropdownMenu onOpenChange={refreshRecent}>
      <DropdownMenuTrigger
        openOnHover
        delay={0}
        closeDelay={150}
        aria-label="Open navigation"
        className="hover:bg-muted data-popup-open:bg-muted inline-flex size-8 items-center justify-center rounded-md"
      >
        <MenuIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLinkItem render={<Link href="/" />}>
          <FolderKanbanIcon />
          Projects
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/?new" />}>
          <PlusIcon />
          New project
        </DropdownMenuLinkItem>
        {recent && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Recent</DropdownMenuLabel>
              <DropdownMenuLinkItem render={<Link href={`/projects/${recent.id}`} />}>
                <HistoryIcon />
                <span className="truncate">{recent.clientName}</span>
                <span className="text-muted-foreground ml-auto font-mono text-xs">
                  {recent.code}
                </span>
              </DropdownMenuLinkItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

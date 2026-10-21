"use client";

import { FolderKanbanIcon, MenuIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type NavProject = { id: string; clientName: string; code: string };

/**
 * Project navigation (REQ-UI-01), folded into the header's left corner so the
 * pages keep the full width. Opens on hover, click or keyboard. Account
 * entries live in the menu at the right corner (`AccountMenu`).
 */
export function NavMenu({ projects }: { projects: NavProject[] }) {
  return (
    <DropdownMenu>
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
        <DropdownMenuGroup>
          <DropdownMenuLinkItem render={<Link href="/" />}>
            <FolderKanbanIcon />
            Projects
          </DropdownMenuLinkItem>
          {projects.map((p) => (
            <DropdownMenuLinkItem
              key={p.id}
              render={<Link href={`/projects/${p.id}`} />}
              className="pl-7"
            >
              <span className="truncate">{p.clientName}</span>
              <span className="text-muted-foreground ml-auto font-mono text-xs">{p.code}</span>
            </DropdownMenuLinkItem>
          ))}
          {projects.length === 0 && (
            <DropdownMenuLabel className="pl-7 font-normal">No projects yet</DropdownMenuLabel>
          )}
          <DropdownMenuLinkItem render={<Link href="/?new" />}>
            <PlusIcon />
            New project
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

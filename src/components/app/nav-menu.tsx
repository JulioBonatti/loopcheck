"use client";

import { FolderKanbanIcon, LogOutIcon, MenuIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type NavProject = { id: string; clientName: string; code: string };

/**
 * Main navigation (REQ-UI-01), folded into the header's left corner so the
 * pages keep the full width. Opens on hover, click or keyboard.
 */
export function NavMenu({ projects }: { projects: NavProject[] }) {
  const [signingOut, startSignOut] = useTransition();

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
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/account" />}>
          <UserIcon />
          My account
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onClick={() => startSignOut(() => signOutAction())}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

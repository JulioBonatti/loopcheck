"use client";

import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { countMyInvitationsAction } from "@/app/(app)/nav-actions";
import { signOutAction } from "@/app/(auth)/actions";
import { CountBadge } from "./count-badge";
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

/**
 * The user's own menu at the header's right corner. The invitation count
 * (REQ-MEM-05) is read again whenever the menu opens: invitations come from
 * other people at any time.
 */
export function AccountMenu({
  name,
  email,
  invitationCount: initialCount,
}: {
  name: string;
  email: string;
  invitationCount: number;
}) {
  const [signingOut, startSignOut] = useTransition();
  const [invitationCount, setInvitationCount] = useState(initialCount);

  function refreshCount(open: boolean) {
    if (open) countMyInvitationsAction().then(setInvitationCount, () => {});
  }

  return (
    <DropdownMenu onOpenChange={refreshCount}>
      <DropdownMenuTrigger
        openOnHover
        delay={0}
        closeDelay={150}
        aria-label="Open account menu"
        className="hover:bg-muted data-popup-open:bg-muted inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm"
      >
        {name}
        <CountBadge count={invitationCount} label="pending invitations" />
        <UserIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate font-normal">{email}</DropdownMenuLabel>
          <DropdownMenuLinkItem render={<Link href="/account" />}>
            <UserIcon />
            My account
            <CountBadge count={invitationCount} label="pending invitations" className="ml-auto" />
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href="/app-settings" />}>
            <SettingsIcon />
            App settings
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onClick={() => startSignOut(() => signOutAction())}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

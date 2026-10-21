"use client";

import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
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

/** The user's own menu at the header's right corner. */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const [signingOut, startSignOut] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={0}
        closeDelay={150}
        aria-label="Open account menu"
        className="hover:bg-muted data-popup-open:bg-muted inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm"
      >
        {name}
        <UserIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate font-normal">{email}</DropdownMenuLabel>
          <DropdownMenuLinkItem render={<Link href="/account" />}>
            <UserIcon />
            My account
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href="/app-settings" />}>
            <SettingsIcon />
            App Settings
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

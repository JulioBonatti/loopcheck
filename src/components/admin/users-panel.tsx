"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { generateTemporaryPasswordAction, setAdminAction } from "@/app/(app)/admin/actions";
import { SearchInput } from "@/components/app/search-input";
import { useAction } from "@/components/app/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { textMatcher } from "@/lib/search";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  projectCount: number;
  /** Already formatted on the server. */
  joined: string;
};

/** Administration → Users (REQ-ACC-04). */
export function UsersPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [query, setQuery] = useState("");
  const matches = textMatcher(useDeferredValue(query));
  const shown = users.filter((u) => matches(`${u.name} ${u.email}`));

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <SearchInput
          label="Filter users"
          placeholder="Filter by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-72"
        />
        <span className="text-muted-foreground text-sm">
          {users.length} {users.length === 1 ? "user" : "users"}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody matches “{query}”.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-2">
          {shown.map((u) => (
            <UserCard key={u.id} user={u} isSelf={u.id === currentUserId} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const { pending, run } = useAction();

  return (
    <div
      role="group"
      aria-label={user.name}
      aria-busy={pending || undefined}
      className="bg-card ring-foreground/10 grid gap-2 rounded-lg p-3 ring-1 aria-busy:opacity-60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {user.name}
            {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
          </p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>
        <div className="flex gap-1">
          {user.mustChangePassword && <Badge variant="outline">Password change pending</Badge>}
          {user.isAdmin && <Badge>Admin</Badge>}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {user.projectCount} {user.projectCount === 1 ? "project" : "projects"} · Joined{" "}
        {user.joined}
      </p>
      <div className="flex flex-wrap gap-2">
        {!isSelf && <TemporaryPasswordButton user={user} />}
        <Button
          variant={user.isAdmin ? "destructive" : "outline"}
          size="xs"
          disabled={pending}
          onClick={() =>
            run(
              () => setAdminAction(user.id, !user.isAdmin),
              user.isAdmin
                ? `${user.name} is no longer an administrator.`
                : `${user.name} is now an administrator.`,
            )
          }
        >
          {user.isAdmin ? "Remove admin" : "Make admin"}
        </Button>
      </div>
    </div>
  );
}

/**
 * REQ-AUTH-07: confirm, then show the password once. It is never shown again;
 * a new one can always be generated.
 */
function TemporaryPasswordButton({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, run } = useAction();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPassword(null);
      setCopied(false);
    }
  }

  async function copy() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>
        <KeyRoundIcon />
        Generate temporary password
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password for {user.name}</DialogTitle>
          <DialogDescription>
            {password
              ? "Copy it now: it will not be shown again. They must choose a new password when they sign in."
              : "Their current password stops working and they are signed out everywhere. At the next sign-in they must choose a new password."}
          </DialogDescription>
        </DialogHeader>
        {password ? (
          <div className="flex items-center gap-2">
            <code
              aria-label="Temporary password"
              className="bg-muted flex-1 rounded-md px-3 py-2 font-mono text-base tracking-wider select-all"
            >
              {password}
            </code>
            <Button variant="outline" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <DialogFooter showCloseButton>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => generateTemporaryPasswordAction(user.id),
                  (data) => setPassword(data.password),
                )
              }
            >
              {pending ? "Generating…" : "Generate password"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

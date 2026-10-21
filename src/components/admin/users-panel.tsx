"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon, UserMinusIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { generateTemporaryPasswordAction, removeUserAction } from "@/app/(app)/admin/actions";
import { SearchInput } from "@/components/app/search-input";
import { useAction } from "@/components/app/use-action";
import { FormField } from "@/components/auth/form-field";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { textMatcher } from "@/lib/search";
import { type PickableUser, UserPicker } from "./user-picker";

export type OwnedProject = { id: string; clientName: string; code: string; inTrash: boolean };

export type UserRow = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  projectCount: number;
  ownedProjects: OwnedProject[];
  /** Already formatted on the server. */
  joined: string;
  /** When an admin removed the account (formatted), or null. */
  removed: string | null;
};

/** Administration → Users (REQ-ACC-04). Removed accounts are hidden unless asked for. */
export function UsersPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [query, setQuery] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const matches = textMatcher(useDeferredValue(query));
  const shown = users.filter((u) => (showRemoved || !u.removed) && matches(`${u.name} ${u.email}`));
  const activeCount = users.filter((u) => !u.removed).length;
  // Possible new owners: active accounts only.
  const candidates: PickableUser[] = users
    .filter((u) => !u.removed)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Filter users"
          placeholder="Filter by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-72"
        />
        <span className="text-muted-foreground text-sm">
          {activeCount} {activeCount === 1 ? "user" : "users"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="show-removed" checked={showRemoved} onCheckedChange={setShowRemoved} />
          <Label htmlFor="show-removed" className="font-normal">
            Show removed
          </Label>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody matches “{query}”.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-2">
          {shown.map((u) => (
            <UserCard key={u.id} user={u} isSelf={u.id === currentUserId} candidates={candidates} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Admin status is not edited here: IT manages it in the database. */
function UserCard({
  user,
  isSelf,
  candidates,
}: {
  user: UserRow;
  isSelf: boolean;
  candidates: PickableUser[];
}) {
  if (user.removed) {
    return (
      <div
        role="group"
        aria-label={user.name}
        className="ring-foreground/10 grid gap-2 rounded-lg border border-dashed p-3 opacity-70"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          </div>
          <Badge variant="outline">Removed</Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          Joined {user.joined} · Removed {user.removed}
        </p>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={user.name}
      className="bg-card ring-foreground/10 grid gap-2 rounded-lg p-3 ring-1"
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
      {!isSelf && (
        <div className="flex flex-wrap gap-2">
          <TemporaryPasswordButton user={user} />
          {!user.isAdmin && (
            <RemoveUserButton user={user} candidates={candidates.filter((c) => c.id !== user.id)} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Removes (deactivates) the account. Every active project it owns needs a new
 * owner; projects already in the trash stay there, without owner.
 */
function RemoveUserButton({ user, candidates }: { user: UserRow; candidates: PickableUser[] }) {
  const [open, setOpen] = useState(false);
  const [newOwners, setNewOwners] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState("");
  const { pending, run } = useAction();
  const active = user.ownedProjects.filter((p) => !p.inTrash);
  const trashed = user.ownedProjects.filter((p) => p.inTrash);
  const ready = active.every((p) => newOwners[p.id]) && typed.trim().toLowerCase() === user.email;

  function onOpenChange(next: boolean) {
    setOpen(next);
    setNewOwners({});
    setTyped("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="destructive" size="xs" />}>
        <UserMinusIcon />
        Remove user
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Remove {user.name}?</DialogTitle>
          <DialogDescription>
            They can no longer sign in and leave all their projects. Their name stays in the
            history. IT can reactivate the account later, but projects do not come back.
          </DialogDescription>
        </DialogHeader>

        {active.length > 0 && (
          <div className="grid gap-3">
            <p className="text-sm font-medium">
              Choose a new owner for {active.length === 1 ? "this project" : "these projects"}
            </p>
            {active.map((p) => (
              <div key={p.id} className="grid gap-1.5">
                <p className="text-sm">
                  {p.clientName} <span className="text-muted-foreground font-mono">{p.code}</span>
                </p>
                <UserPicker
                  label={`New owner of ${p.code}`}
                  users={candidates}
                  value={newOwners[p.id] ?? null}
                  onChange={(id) => setNewOwners((prev) => ({ ...prev, [p.id]: id }))}
                />
              </div>
            ))}
          </div>
        )}

        {trashed.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Owned projects in the trash stay there without owner (
            {trashed.map((p) => p.code).join(", ")}). Restoring one asks for a new owner.
          </p>
        )}

        <FormField
          name="confirmEmail"
          label={`Type ${user.email} to confirm`}
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            disabled={!ready || pending}
            onClick={() =>
              run(
                () => removeUserAction(user.id, typed, newOwners),
                () => onOpenChange(false),
              )
            }
          >
            {pending ? "Removing…" : "Remove user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

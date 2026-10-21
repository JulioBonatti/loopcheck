"use client";

import { MailIcon } from "lucide-react";
import { useDeferredValue, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cancelInvitationAction,
  changeMemberRoleAction,
  removeMemberAction,
} from "@/app/(app)/projects/member-actions";
import { SearchInput } from "@/components/app/search-input";
import { useProjectDates } from "@/components/project/project-context";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ProjectRole, roleLabels } from "@/lib/permissions";
import { textMatcher } from "@/lib/search";
import type { PendingInvitation, ProjectMember } from "@/server/queries/members";
import type { ActionResult } from "@/server/services/errors";
import { InviteMemberDialog } from "./invite-member-dialog";
import { ASSIGNABLE_ROLES } from "./roles";

/**
 * Project settings → Members (REQ-SET-07). Everyone with access to settings
 * sees the lists; only the owner gets controls (REQ-PERM-02) — the server
 * refuses the rest anyway (REQ-PERM-01).
 */
export function MembersSection({
  projectId,
  canManage,
  members,
  invitations,
}: {
  projectId: string;
  canManage: boolean;
  members: ProjectMember[];
  invitations: PendingInvitation[];
}) {
  const [query, setQuery] = useState("");
  const matches = textMatcher(useDeferredValue(query));
  const shownMembers = members.filter((m) => matches(`${m.firstName} ${m.lastName} ${m.email}`));
  const shownInvitations = invitations.filter((i) => matches(i.email));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Filter members"
          placeholder="Filter by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-72"
        />
        <span className="text-muted-foreground text-sm">
          {members.length} {members.length === 1 ? "member" : "members"}
          {invitations.length > 0 && ` · ${invitations.length} pending`}
        </span>
        {canManage && (
          <div className="ml-auto">
            <InviteMemberDialog projectId={projectId} />
          </div>
        )}
      </div>

      <div className="max-h-[28rem] overflow-y-auto pr-1">
        {shownMembers.length === 0 && shownInvitations.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nobody matches “{query}”.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2">
            {shownMembers.map((m) => (
              <MemberCard key={m.userId} projectId={projectId} member={m} canManage={canManage} />
            ))}
            {shownInvitations.map((i) => (
              <InvitationCard
                key={i.id}
                projectId={projectId}
                invitation={i}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Runs an action and reports a failure in a toast. */
function useAction() {
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult<void>>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error.message);
      else if (success) toast.success(success);
    });
  }
  return { pending, run };
}

function MemberCard({
  projectId,
  member,
  canManage,
}: {
  projectId: string;
  member: ProjectMember;
  canManage: boolean;
}) {
  const dates = useProjectDates();
  const { pending, run } = useAction();
  const name = `${member.firstName} ${member.lastName}`;
  const editable = canManage && member.role !== "owner";

  return (
    <div
      className="bg-card ring-foreground/10 grid gap-2 rounded-lg p-3 ring-1 aria-busy:opacity-60"
      aria-busy={pending || undefined}
      aria-label={name}
      role="group"
    >
      <div className="flex items-center gap-2.5">
        <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold">
          {initials(member.firstName, member.lastName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-muted-foreground truncate text-xs">{member.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {editable ? (
          <Select
            value={member.role}
            items={ASSIGNABLE_ROLES}
            onValueChange={(role) =>
              role &&
              run(
                () => changeMemberRoleAction(projectId, member.userId, role),
                `${name} is now ${roleLabels[role as ProjectRole].toLowerCase()}.`,
              )
            }
          >
            <SelectTrigger size="sm" aria-label={`Role of ${name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={member.role === "owner" ? "default" : "secondary"}>
            {roleLabels[member.role]}
          </Badge>
        )}
        <span className="text-muted-foreground text-xs">Since {dates.date(member.addedAt)}</span>
        {editable && (
          <RemoveMemberButton
            name={name}
            disabled={pending}
            onConfirm={() =>
              run(() => removeMemberAction(projectId, member.userId), `${name} was removed.`)
            }
          />
        )}
      </div>
    </div>
  );
}

function RemoveMemberButton({
  name,
  disabled,
  onConfirm,
}: {
  name: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="destructive" size="xs" className="ml-auto" disabled={disabled} />}
      >
        Remove
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name}?</DialogTitle>
          <DialogDescription>
            They lose access to this project. Their history stays, and you can invite them again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Remove member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvitationCard({
  projectId,
  invitation,
  canManage,
}: {
  projectId: string;
  invitation: PendingInvitation;
  canManage: boolean;
}) {
  const dates = useProjectDates();
  const { pending, run } = useAction();

  return (
    <div
      className="ring-foreground/15 grid gap-2 rounded-lg border border-dashed p-3 aria-busy:opacity-60"
      aria-busy={pending || undefined}
      aria-label={`Invitation to ${invitation.email}`}
      role="group"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full border border-dashed">
          <MailIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{invitation.email}</p>
          <p className="text-muted-foreground truncate text-xs">
            Invited by {invitation.invitedBy} on {dates.date(invitation.createdAt)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{roleLabels[invitation.role]}</Badge>
        <span className="text-muted-foreground text-xs">Pending</span>
        {canManage && (
          <Button
            variant="destructive"
            size="xs"
            className="ml-auto"
            disabled={pending}
            onClick={() =>
              run(
                () => cancelInvitationAction(projectId, invitation.id),
                `Invitation to ${invitation.email} cancelled.`,
              )
            }
          >
            Cancel invitation
          </Button>
        )}
      </div>
    </div>
  );
}

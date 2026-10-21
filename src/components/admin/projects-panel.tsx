"use client";

import { useDeferredValue, useState } from "react";
import { transferOwnershipAction } from "@/app/(app)/admin/actions";
import { SearchInput } from "@/components/app/search-input";
import { useAction } from "@/components/app/use-action";
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
import { type PickableUser, UserPicker } from "./user-picker";

export type AdminProjectRow = {
  id: string;
  clientName: string;
  code: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  /** Already formatted in the project's format. */
  created: string;
};

/**
 * Administration → Projects: every project outside the trash, for ownership
 * transfer (REQ-PROJ-05). It does not open the projects (REQ-PERM-03).
 */
export function ProjectsPanel({
  projects,
  users,
}: {
  projects: AdminProjectRow[];
  users: PickableUser[];
}) {
  const [query, setQuery] = useState("");
  const matches = textMatcher(useDeferredValue(query));
  const shown = projects.filter((p) =>
    matches(`${p.clientName} ${p.code} ${p.ownerName ?? ""} ${p.ownerEmail ?? ""}`),
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <SearchInput
          label="Filter projects"
          placeholder="Filter by client, code or owner…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-80"
        />
        <span className="text-muted-foreground text-sm">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {projects.length === 0 ? "No projects yet." : `No projects match “${query}”.`}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-2">
          {shown.map((p) => (
            <div
              key={p.id}
              role="group"
              aria-label={`${p.clientName} ${p.code}`}
              className="bg-card ring-foreground/10 grid gap-2 rounded-lg p-3 ring-1"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.clientName}</p>
                <p className="text-muted-foreground font-mono text-xs">{p.code}</p>
              </div>
              <p className="text-muted-foreground text-xs">
                Owner: {p.ownerName ? `${p.ownerName} (${p.ownerEmail})` : "none"}
                <br />
                {p.memberCount} {p.memberCount === 1 ? "member" : "members"} · Created {p.created}
              </p>
              <TransferOwnershipButton project={p} users={users} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TransferOwnershipButton({
  project,
  users,
}: {
  project: AdminProjectRow;
  users: PickableUser[];
}) {
  const [open, setOpen] = useState(false);
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const { pending, run } = useAction();
  const candidates = users.filter((u) => u.id !== project.ownerId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setNewOwner(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="xs" className="justify-self-start" />}>
        Transfer ownership
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Transfer {project.clientName} {project.code}
          </DialogTitle>
          <DialogDescription>
            The new owner joins the project if needed; the current owner
            {project.ownerName ? ` (${project.ownerName})` : ""} becomes a member.
          </DialogDescription>
        </DialogHeader>
        <UserPicker label="New owner" users={candidates} value={newOwner} onChange={setNewOwner} />
        <DialogFooter showCloseButton>
          <Button
            disabled={!newOwner || pending}
            onClick={() =>
              newOwner &&
              run(
                () => transferOwnershipAction(project.id, newOwner),
                () => setOpen(false),
              )
            }
          >
            {pending ? "Transferring…" : "Transfer ownership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

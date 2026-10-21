"use client";

import { useActionState, useState } from "react";
import {
  type PurgeState,
  purgeProjectAction,
  restoreProjectAction,
} from "@/app/(app)/admin/actions";
import { useAction } from "@/components/app/use-action";
import { FormField } from "@/components/auth/form-field";
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

export type TrashedRow = {
  id: string;
  clientName: string;
  code: string;
  deletedBy: string | null;
  /** Already formatted in the project's format and time zone. */
  deleted: string;
  memberCount: number;
};

/** Administration → Trash: deleted projects (REQ-PROJ-04). IO lists come in step 13. */
export function TrashPanel({ projects }: { projects: TrashedRow[] }) {
  if (projects.length === 0) {
    return <p className="text-muted-foreground text-sm">The trash is empty.</p>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-2">
      {projects.map((p) => (
        <TrashedCard key={p.id} project={p} />
      ))}
    </div>
  );
}

function TrashedCard({ project }: { project: TrashedRow }) {
  const { pending, run } = useAction();
  const label = `${project.clientName} ${project.code}`;

  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={pending || undefined}
      className="ring-foreground/15 grid gap-2 rounded-lg border border-dashed p-3 aria-busy:opacity-60"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{project.clientName}</p>
        <p className="text-muted-foreground font-mono text-xs">{project.code}</p>
      </div>
      <p className="text-muted-foreground text-xs">
        Deleted {project.deleted}
        {project.deletedBy && ` by ${project.deletedBy}`} · {project.memberCount}{" "}
        {project.memberCount === 1 ? "member" : "members"}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="xs"
          disabled={pending}
          onClick={() => run(() => restoreProjectAction(project.id), `${label} was restored.`)}
        >
          Restore
        </Button>
        <PurgeButton projectId={project.id} code={project.code} />
      </div>
    </div>
  );
}

/** `Delete permanently`, confirmed by typing the code (REQ-PROJ-04). */
function PurgeButton({ projectId, code }: { projectId: string; code: string }) {
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<PurgeState, FormData>(
    purgeProjectAction.bind(null, projectId),
    {},
  );

  return (
    <Dialog onOpenChange={() => setTyped("")}>
      <DialogTrigger render={<Button variant="destructive" size="xs" />}>
        Delete permanently
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {code} permanently?</DialogTitle>
          <DialogDescription>
            Everything in this project is erased: IO list, checkouts, issues, members and its
            history. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <FormField
            name="confirmCode"
            label={`Type ${code} to confirm`}
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            errors={state.error?.fieldErrors?.confirmCode ?? (state.error && [state.error.message])}
          />
          <DialogFooter showCloseButton>
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== code}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

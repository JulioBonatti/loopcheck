"use client";

import { useActionState, useState } from "react";
import { type DeleteProjectState, deleteProjectAction } from "@/app/(app)/projects/actions";
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

/** Settings → Danger zone → `Delete project` (REQ-PROJ-03, REQ-SET-08). */
export function DeleteProjectDialog({ projectId, code }: { projectId: string; code: string }) {
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DeleteProjectState, FormData>(
    deleteProjectAction.bind(null, projectId),
    {},
  );

  return (
    <Dialog onOpenChange={() => setTyped("")}>
      <DialogTrigger render={<Button variant="destructive" />}>Delete project</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this project?</DialogTitle>
          <DialogDescription>
            The project goes to the trash and disappears for all members. Only an administrator can
            restore it.
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
              {pending ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

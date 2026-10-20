"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { leaveProjectAction } from "@/app/(app)/account/actions";
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

/** `Leave project` with a confirmation (REQ-ACC-01). */
export function LeaveProjectButton({ projectId, label }: { projectId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function leave() {
    startTransition(async () => {
      const result = await leaveProjectAction(projectId);
      if (result.ok) {
        setOpen(false);
        toast.success(`You left ${label}.`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Leave project</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {label}?</DialogTitle>
          <DialogDescription>
            You will lose access to this project. The owner can invite you again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button variant="destructive" onClick={leave} disabled={pending}>
            {pending ? "Leaving…" : "Leave project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

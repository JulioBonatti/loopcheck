"use client";

import { UserPlusIcon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { type InviteState, inviteMemberAction } from "@/app/(app)/projects/member-actions";
import { FormField } from "@/components/auth/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSIGNABLE_ROLES } from "./roles";

/** `Invite by email` (REQ-MEM-01). */
export function InviteMemberDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlusIcon />
        Invite by email
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite by email</DialogTitle>
          <DialogDescription>
            No email is sent: the person sees the invitation in My account after signing in, or
            after signing up with this address.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts empty */}
        {open && <InviteForm projectId={projectId} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    inviteMemberAction.bind(null, projectId),
    {},
  );
  const fieldErrors = state.error?.fieldErrors ?? {};
  const formError = Object.keys(fieldErrors).length === 0 ? state.error?.message : undefined;

  useEffect(() => {
    if (state.invited) {
      toast.success(`Invitation sent to ${state.invited}.`);
      onDone();
    }
  }, [state.invited, onDone]);

  return (
    <form action={action} className="grid gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="off"
        required
        autoFocus
        defaultValue={state.values?.email}
        errors={fieldErrors.email}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="role">Role</Label>
        <Select name="role" defaultValue={state.values?.role || "member"} items={ASSIGNABLE_ROLES}>
          <SelectTrigger id="role" className="w-40">
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
        <p className="text-muted-foreground text-xs">
          Members work on the loop check; viewers only look.
        </p>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Send invitation"}
        </Button>
      </DialogFooter>
    </form>
  );
}

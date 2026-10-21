"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { respondToInvitationAction } from "@/app/(app)/account/actions";
import { Button } from "@/components/ui/button";

/** `Accept` / `Decline` of one invitation (REQ-MEM-02). */
export function InvitationButtons({
  invitationId,
  project,
}: {
  invitationId: string;
  project: string;
}) {
  const [pending, startTransition] = useTransition();

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = await respondToInvitationAction(invitationId, accept);
      if (!result.ok) toast.error(result.error.message);
      else toast.success(accept ? `You joined ${project}.` : `Invitation to ${project} declined.`);
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => respond(true)}>
        Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => respond(false)}>
        Decline
      </Button>
    </div>
  );
}

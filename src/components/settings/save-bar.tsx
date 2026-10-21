"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionError } from "@/server/services/errors";

/** Every message of a failed save: the general one and the field ones. */
export function errorMessages(error: ActionError): string[] {
  const fields = Object.values(error.fieldErrors ?? {}).flatMap((m) => m ?? []);
  return fields.length > 0 ? [...new Set(fields)] : [error.message];
}

/**
 * The `Save` of a settings section (decision of 2026-10-21): greyed out until
 * something changes, then enabled. `Discard` puts the section back as loaded.
 */
export function SaveBar({
  dirty,
  pending,
  error,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  pending: boolean;
  error: ActionError | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="bg-background/95 sticky bottom-0 z-10 grid gap-2 border-t py-3 backdrop-blur">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {errorMessages(error).map((m) => (
              <p key={m}>{m}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {dirty && !pending && (
          <Button variant="ghost" onClick={onDiscard}>
            Discard changes
          </Button>
        )}
        {dirty && <span className="text-muted-foreground text-sm">Unsaved changes</span>}
      </div>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { type ProjectFormState, updateProjectAction } from "@/app/(app)/projects/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProjectFormFields, type ProjectFormValues } from "./project-form-fields";

/** Settings → Project (REQ-SET-01). */
export function ProjectSettingsForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectFormValues;
}) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    updateProjectAction.bind(null, projectId),
    {},
  );
  const fieldErrors = state.error?.fieldErrors ?? {};
  const formError = Object.keys(fieldErrors).length === 0 ? state.error?.message : undefined;
  const values = (state.values as ProjectFormValues | undefined) ?? initial;

  return (
    <form action={action} className="grid gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <ProjectFormFields values={values} errors={fieldErrors} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved && <span className="text-muted-foreground text-sm">Saved.</span>}
      </div>
    </form>
  );
}

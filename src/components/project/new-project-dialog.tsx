"use client";

import { PlusIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { createProjectAction, type ProjectFormState } from "@/app/(app)/projects/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { todayIn } from "@/lib/dates";
import { ProjectFormFields, type ProjectFormValues } from "./project-form-fields";

/** Defaults of REQ-PROJ-01: today and the browser's time zone. */
function defaults(): ProjectFormValues {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    clientName: "",
    code: "",
    description: "",
    fieldStartDate: todayIn(timezone),
    timezone,
    dateFormat: "YYYY/MM/DD",
  };
}

/**
 * `New project` button and dialog (REQ-PROJ-01). Also opens from the header
 * menu, which links to `/?new`.
 */
export function NewProjectDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const open = useSearchParams().has("new");

  function setOpen(next: boolean) {
    router.replace(next ? `${pathname}?new` : pathname, { scroll: false });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        New project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>You will be the owner of this project.</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each opening starts from fresh defaults */}
          {open && <NewProjectForm />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewProjectForm() {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    createProjectAction,
    {},
  );
  const fieldErrors = state.error?.fieldErrors ?? {};
  const formError = Object.keys(fieldErrors).length === 0 ? state.error?.message : undefined;
  const values = (state.values as ProjectFormValues | undefined) ?? defaults();

  return (
    <form action={action} className="grid gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <ProjectFormFields values={values} errors={fieldErrors} autoFocus />
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </DialogFooter>
    </form>
  );
}

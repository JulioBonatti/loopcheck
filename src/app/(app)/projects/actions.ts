"use server";

import { redirect } from "next/navigation";
import { projectHref } from "@/lib/routes";
import { requireActor } from "@/server/auth/session";
import { refreshProjectLists } from "../refresh";
import { type ActionError, toActionResult } from "@/server/services/errors";
import { createProject, deleteProject, updateProject } from "@/server/services/projects";

export type ProjectFormState = {
  error?: ActionError;
  values?: Record<string, string>;
  saved?: boolean;
};

const PROJECT_FIELDS = [
  "clientName",
  "code",
  "description",
  "fieldStartDate",
  "timezone",
  "dateFormat",
] as const;

function readProjectForm(formData: FormData) {
  return Object.fromEntries(PROJECT_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
}

/** REQ-PROJ-01: opens the new project on its Loop check tab. */
export async function createProjectAction(
  _: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const actor = await requireActor();
  const values = readProjectForm(formData);
  const result = await toActionResult(() => createProject(actor, values));
  if (!result.ok) return { error: result.error, values };
  refreshProjectLists();
  redirect(projectHref(result.data.id));
}

/** REQ-SET-01. Bound to the project id in the form. */
export async function updateProjectAction(
  projectId: string,
  _: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const actor = await requireActor();
  const values = readProjectForm(formData);
  const result = await toActionResult(() => updateProject(actor, projectId, values));
  if (!result.ok) return { error: result.error, values };
  refreshProjectLists();
  return { saved: true, values };
}

export type DeleteProjectState = { error?: ActionError };

/** REQ-PROJ-03: the project goes to the trash; back to the projects list. */
export async function deleteProjectAction(
  projectId: string,
  _: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  const actor = await requireActor();
  const result = await toActionResult(() =>
    deleteProject(actor, projectId, { confirmCode: String(formData.get("confirmCode") ?? "") }),
  );
  if (!result.ok) return { error: result.error };
  refreshProjectLists();
  redirect("/");
}

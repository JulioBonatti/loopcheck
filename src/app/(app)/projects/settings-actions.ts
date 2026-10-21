"use server";

import { refresh } from "next/cache";
import { requireActor } from "@/server/auth/session";
import { type ActionResult, toActionResult } from "@/server/services/errors";
import type { Actor } from "@/server/services/permissions";
import {
  saveColumns,
  saveIssueTypes,
  savePresets,
  saveProcedures,
} from "@/server/services/settings";

/** Saves a Project settings section, then reloads it (with its new token). */
async function save(change: (actor: Actor) => Promise<void>): Promise<ActionResult<void>> {
  const actor = await requireActor();
  const result = await toActionResult(() => change(actor));
  if (result.ok) refresh();
  return result;
}

export async function saveColumnsAction(projectId: string, input: unknown) {
  return save((actor) => saveColumns(actor, projectId, input));
}

export async function saveIssueTypesAction(projectId: string, input: unknown) {
  return save((actor) => saveIssueTypes(actor, projectId, input));
}

export async function savePresetsAction(projectId: string, input: unknown) {
  return save((actor) => savePresets(actor, projectId, input));
}

export async function saveProceduresAction(projectId: string, input: unknown) {
  return save((actor) => saveProcedures(actor, projectId, input));
}

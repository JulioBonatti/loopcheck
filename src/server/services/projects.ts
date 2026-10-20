/**
 * Projects (SPEC §6): create, edit settings (REQ-SET-01) and move to the
 * trash (REQ-PROJ-03). Restore and purge are admin actions (step 8).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { dateFormats, isIsoDate, isValidTimeZone } from "@/lib/dates";
import { BUILTIN_FIELDS, DEFAULT_ISSUE_TYPES } from "@/lib/fields";
import type { Db, Tx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import { issueTypes, projectFields, projectMembers, projects } from "@/server/db/schema";
import { ValidationError } from "./errors";
import { mutate } from "./mutation";
import { type Actor, requireProjectPermission } from "./permissions";

export const projectSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required.").max(200, "Too long."),
  code: z.string().trim().min(1, "Project code is required.").max(50, "Too long."),
  description: z
    .string()
    .trim()
    .max(2000, "Too long.")
    .transform((v) => v || null),
  fieldStartDate: z.string().refine(isIsoDate, "Enter a valid date."),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone."),
  dateFormat: z.enum(dateFormats, "Choose a date format."),
});

export type ProjectInput = z.input<typeof projectSchema>;

/** The unique index on the code becomes a message on the field. */
async function withUniqueCode<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error, "projects_code_unique")) {
      throw new ValidationError(undefined, { code: ["A project with this code already exists."] });
    }
    throw error;
  }
}

/** REQ-PROJ-01, REQ-PROJ-02. Any signed-in user; the creator becomes owner. */
export function createProject(actor: Actor, input: unknown, { db }: { db?: Db } = {}) {
  return mutate({
    db,
    actor,
    authorize: () => undefined,
    schema: projectSchema,
    input,
    run: async ({ tx, audit }, data) => {
      const [project] = await withUniqueCode(() =>
        tx
          .insert(projects)
          .values({ ...data, createdBy: actor.userId })
          .returning(),
      );
      await tx
        .insert(projectMembers)
        .values({ projectId: project.id, userId: actor.userId, role: "owner" });
      await insertDefaults(tx, project.id);

      audit({
        action: "project.create",
        entityType: "project",
        entityId: project.id,
        projectId: project.id,
        after: data,
      });
      return project;
    },
  });
}

/** Builtin columns and default issue types; no test procedures (REQ-PROJ-02). */
async function insertDefaults(tx: Tx, projectId: string) {
  await tx.insert(projectFields).values(
    BUILTIN_FIELDS.map((f, i) => ({
      projectId,
      key: f.key,
      label: f.label,
      source: "builtin" as const,
      dataType: f.dataType,
      sortOrder: i + 1,
      required: f.required,
      testRelevant: f.testRelevant,
    })),
  );
  await tx
    .insert(issueTypes)
    .values(DEFAULT_ISSUE_TYPES.map((name, i) => ({ projectId, name, sortOrder: i + 1 })));
}

/** REQ-SET-01: owner and member. */
export function updateProject(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "settings.edit"),
    schema: projectSchema,
    input,
    run: async ({ tx, audit }, data) => {
      const [before] = await tx
        .select({
          clientName: projects.clientName,
          code: projects.code,
          description: projects.description,
          fieldStartDate: projects.fieldStartDate,
          timezone: projects.timezone,
          dateFormat: projects.dateFormat,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      const [project] = await withUniqueCode(() =>
        tx.update(projects).set(data).where(eq(projects.id, projectId)).returning(),
      );

      audit({
        action: "project.update",
        entityType: "project",
        entityId: projectId,
        projectId,
        before,
        after: data,
      });
      return project;
    },
  });
}

/** REQ-PROJ-03: owner only, confirmed by typing the project code. */
export function deleteProject(
  actor: Actor,
  projectId: string,
  input: unknown,
  { db }: { db?: Db } = {},
) {
  return mutate({
    db,
    actor,
    authorize: (tx) => requireProjectPermission(tx, actor, projectId, "project.delete"),
    schema: z.object({ confirmCode: z.string().trim() }),
    input,
    run: async ({ tx, audit }, { confirmCode }) => {
      const [project] = await tx
        .select({ code: projects.code })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (confirmCode !== project.code) {
        throw new ValidationError(undefined, {
          confirmCode: ["Type the project code exactly to confirm."],
        });
      }

      const deletedAt = new Date();
      await tx
        .update(projects)
        .set({ deletedAt, deletedBy: actor.userId })
        .where(eq(projects.id, projectId));
      audit({
        action: "project.delete",
        entityType: "project",
        entityId: projectId,
        projectId,
        before: { deletedAt: null },
        after: { deletedAt },
      });
    },
  });
}

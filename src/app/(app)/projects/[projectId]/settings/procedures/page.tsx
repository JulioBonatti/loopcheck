import type { Metadata } from "next";
import { ProceduresEditor } from "@/components/settings/procedures-editor";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { requireSettingsProject } from "@/server/queries/projects";
import { readProcedures } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Test procedures · Project settings · LoopCheck" };

/** Project settings → Test procedures (REQ-SET-06). */
export default async function ProceduresSettingsPage({
  params,
}: PageProps<"/projects/[projectId]/settings/procedures">) {
  const { projectId } = await params;
  const user = await requireUser();
  await requireSettingsProject(user.id, projectId);
  const procedures = await readProcedures(db, projectId);
  return <ProceduresEditor key={procedures.token} projectId={projectId} initial={procedures} />;
}

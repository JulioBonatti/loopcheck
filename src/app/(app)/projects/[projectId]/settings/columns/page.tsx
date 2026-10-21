import type { Metadata } from "next";
import { ColumnsEditor } from "@/components/settings/columns-editor";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { requireSettingsProject } from "@/server/queries/projects";
import { readColumns } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Columns · Project settings · LoopCheck" };

/** Project settings → Columns (REQ-SET-03). */
export default async function ColumnsSettingsPage({
  params,
}: PageProps<"/projects/[projectId]/settings/columns">) {
  const { projectId } = await params;
  const user = await requireUser();
  await requireSettingsProject(user.id, projectId);
  const columns = await readColumns(db, projectId);
  // Keyed by the token: after a save, the editor restarts from the saved state.
  return <ColumnsEditor key={columns.token} projectId={projectId} initial={columns} />;
}

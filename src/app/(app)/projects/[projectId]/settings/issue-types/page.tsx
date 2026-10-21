import type { Metadata } from "next";
import { IssueTypesEditor } from "@/components/settings/issue-types-editor";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { requireSettingsProject } from "@/server/queries/projects";
import { readIssueTypes } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Issue types · Project settings · LoopCheck" };

/** Project settings → Issue types (REQ-SET-04). */
export default async function IssueTypesSettingsPage({
  params,
}: PageProps<"/projects/[projectId]/settings/issue-types">) {
  const { projectId } = await params;
  const user = await requireUser();
  await requireSettingsProject(user.id, projectId);
  const types = await readIssueTypes(db, projectId);
  return <IssueTypesEditor key={types.token} projectId={projectId} initial={types} />;
}

import type { Metadata } from "next";
import { PresetsEditor } from "@/components/settings/presets-editor";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { requireSettingsProject } from "@/server/queries/projects";
import { readIssueTypes, readPresets } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Presets · Project settings · LoopCheck" };

/** Project settings → Presets (REQ-SET-05). */
export default async function PresetsSettingsPage({
  params,
}: PageProps<"/projects/[projectId]/settings/presets">) {
  const { projectId } = await params;
  const user = await requireUser();
  await requireSettingsProject(user.id, projectId);
  const [presets, { types }] = await Promise.all([
    readPresets(db, projectId),
    readIssueTypes(db, projectId),
  ]);
  return (
    <PresetsEditor key={presets.token} projectId={projectId} initial={presets} types={types} />
  );
}

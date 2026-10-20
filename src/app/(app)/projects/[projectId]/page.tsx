import { redirect } from "next/navigation";

/** Opening a project goes straight to the Loop Check tab (REQ-UI-01). */
export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/loop-check`);
}

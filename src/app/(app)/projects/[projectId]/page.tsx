import { redirect } from "next/navigation";
import { projectHref } from "@/lib/routes";

/**
 * Opening a project goes straight to the Loop check tab (REQ-UI-01). Links
 * use `projectHref` and skip this redirect; it serves typed URLs.
 */
export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  redirect(projectHref(projectId));
}

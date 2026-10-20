import { notFound } from "next/navigation";
import { ProjectProvider } from "@/components/project/project-context";
import { ProjectTabs } from "@/components/project/project-tabs";
import { requireUser } from "@/server/auth/session";
import { getProjectForUserOnce } from "@/server/queries/projects";

/** Project header (client, code, current revision) and tabs (REQ-UI-03). */
export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const user = await requireUser();
  const project = await getProjectForUserOnce(user.id, projectId);
  if (!project) notFound();

  return (
    <ProjectProvider
      value={{
        id: project.id,
        code: project.code,
        role: project.role,
        timezone: project.timezone,
        dateFormat: project.dateFormat,
      }}
    >
      <div className="-mx-4 -mt-4 mb-4 border-b px-4 pt-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">{project.clientName}</h1>
          <span className="text-muted-foreground font-mono text-sm">{project.code}</span>
          <span className="text-muted-foreground ml-auto text-sm">
            {project.revisionName ? `Revision: ${project.revisionName}` : "No IO list imported"}
          </span>
        </div>
        <ProjectTabs />
      </div>
      {children}
    </ProjectProvider>
  );
}

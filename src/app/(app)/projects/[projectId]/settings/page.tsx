import type { Metadata } from "next";
import { DeleteProjectDialog } from "@/components/project/delete-project-dialog";
import { ProjectSettingsForm } from "@/components/project/project-settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { requireSettingsProject } from "@/server/queries/projects";

export const metadata: Metadata = { title: "Project settings · LoopCheck" };

/** Project settings → General: project data (REQ-SET-01) and Danger zone (REQ-SET-08). */
export default async function GeneralSettingsPage({
  params,
}: PageProps<"/projects/[projectId]/settings">) {
  const { projectId } = await params;
  const user = await requireUser();
  const project = await requireSettingsProject(user.id, projectId);

  return (
    <div className="grid max-w-4xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectSettingsForm
            projectId={project.id}
            initial={{
              clientName: project.clientName,
              code: project.code,
              description: project.description ?? "",
              fieldStartDate: project.fieldStartDate,
              timezone: project.timezone,
              dateFormat: project.dateFormat,
            }}
          />
        </CardContent>
      </Card>

      {roleCan(project.role, "project.delete") && (
        <Card className="ring-destructive/40">
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
            <CardDescription>
              Deleting moves the project to the trash, where only an administrator can restore it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteProjectDialog projectId={project.id} code={project.code} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

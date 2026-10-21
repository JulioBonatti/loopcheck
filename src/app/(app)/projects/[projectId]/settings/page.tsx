import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MembersSection } from "@/components/members/members-section";
import { DeleteProjectDialog } from "@/components/project/delete-project-dialog";
import { ProjectSettingsForm } from "@/components/project/project-settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { listProjectInvitations, listProjectMembers } from "@/server/queries/members";
import { getProjectForUserOnce } from "@/server/queries/projects";

export const metadata: Metadata = { title: "Project settings · LoopCheck" };

/**
 * Settings tab (SPEC §7.6). Owner and member edit; viewers do not see it.
 * Columns, issue types, presets and procedures come in step 9.
 */
export default async function SettingsPage({
  params,
}: PageProps<"/projects/[projectId]/settings">) {
  const { projectId } = await params;
  const user = await requireUser();
  const project = await getProjectForUserOnce(user.id, projectId);
  if (!project || !roleCan(project.role, "settings.edit")) notFound();
  const [members, invitations] = await Promise.all([
    listProjectMembers(project.id),
    listProjectInvitations(project.id),
  ]);

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

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          {!roleCan(project.role, "members.manage") && (
            <CardDescription>Only the project owner can invite or change members.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <MembersSection
            projectId={project.id}
            canManage={roleCan(project.role, "members.manage")}
            members={members}
            invitations={invitations}
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

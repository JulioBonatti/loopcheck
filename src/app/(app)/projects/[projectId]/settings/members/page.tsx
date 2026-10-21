import type { Metadata } from "next";
import { MembersSection } from "@/components/members/members-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleCan } from "@/lib/permissions";
import { requireUser } from "@/server/auth/session";
import { listProjectInvitations, listProjectMembers } from "@/server/queries/members";
import { requireSettingsProject } from "@/server/queries/projects";

export const metadata: Metadata = { title: "Members · Project settings · LoopCheck" };

/** Project settings → Members (REQ-SET-07). */
export default async function MembersSettingsPage({
  params,
}: PageProps<"/projects/[projectId]/settings/members">) {
  const { projectId } = await params;
  const user = await requireUser();
  const project = await requireSettingsProject(user.id, projectId);
  const canManage = roleCan(project.role, "members.manage");
  const [members, invitations] = await Promise.all([
    listProjectMembers(project.id),
    listProjectInvitations(project.id),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        {!canManage && (
          <CardDescription>Only the project owner can invite or change members.</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <MembersSection
          projectId={project.id}
          canManage={canManage}
          members={members}
          invitations={invitations}
        />
      </CardContent>
    </Card>
  );
}

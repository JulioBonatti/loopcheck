import type { Metadata } from "next";
import { ProjectsPanel } from "@/components/admin/projects-panel";
import { requireAdminUser } from "@/server/auth/session";
import { formatDate } from "@/lib/dates";
import { listAllProjects, listUsers } from "@/server/queries/admin";

export const metadata: Metadata = { title: "Projects · Administration · LoopCheck" };

/** Administration → Projects (REQ-PROJ-05). */
export default async function AdminProjectsPage() {
  await requireAdminUser();
  const [projects, users] = await Promise.all([listAllProjects(), listUsers()]);
  return (
    <ProjectsPanel
      projects={projects.map((p) => ({
        id: p.id,
        clientName: p.clientName,
        code: p.code,
        ownerId: p.ownerId,
        ownerName: p.ownerName,
        ownerEmail: p.ownerEmail,
        memberCount: p.memberCount,
        created: formatDate(p.createdAt, p),
      }))}
      users={users
        .filter((u) => !u.deactivatedAt)
        .map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
          email: u.email,
        }))}
    />
  );
}

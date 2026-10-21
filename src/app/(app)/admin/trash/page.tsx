import type { Metadata } from "next";
import { TrashPanel } from "@/components/admin/trash-panel";
import { requireAdminUser } from "@/server/auth/session";
import { formatDateTime } from "@/lib/dates";
import { listTrashedProjects, listUsers } from "@/server/queries/admin";

export const metadata: Metadata = { title: "Trash · Administration · LoopCheck" };

/** Administration → Trash (REQ-PROJ-04). */
export default async function AdminTrashPage() {
  await requireAdminUser();
  const [projects, users] = await Promise.all([listTrashedProjects(), listUsers()]);
  return (
    <TrashPanel
      projects={projects.map((p) => ({
        id: p.id,
        clientName: p.clientName,
        code: p.code,
        deletedBy: p.deletedBy,
        deleted: formatDateTime(p.deletedAt, p),
        memberCount: p.memberCount,
        hasOwner: p.hasOwner,
      }))}
      owners={users
        .filter((u) => !u.deactivatedAt)
        .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email }))}
    />
  );
}

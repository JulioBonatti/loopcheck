import type { Metadata } from "next";
import { TrashPanel } from "@/components/admin/trash-panel";
import { formatDateTime } from "@/lib/dates";
import { listTrashedProjects } from "@/server/queries/admin";

export const metadata: Metadata = { title: "Trash · Administration · LoopCheck" };

/** Administration → Trash (REQ-PROJ-04). The layout checks the admin role. */
export default async function AdminTrashPage() {
  const projects = await listTrashedProjects();
  return (
    <TrashPanel
      projects={projects.map((p) => ({
        id: p.id,
        clientName: p.clientName,
        code: p.code,
        deletedBy: p.deletedBy,
        deleted: formatDateTime(p.deletedAt, p),
        memberCount: p.memberCount,
      }))}
    />
  );
}

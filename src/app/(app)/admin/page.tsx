import type { Metadata } from "next";
import { UsersPanel } from "@/components/admin/users-panel";
import { formatDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { listUsers } from "@/server/queries/admin";

export const metadata: Metadata = { title: "Users · Administration · LoopCheck" };

/** Administration → Users. Dates without a project: YYYY/MM/DD in UTC. */
export default async function AdminUsersPage() {
  const user = await requireUser();
  const users = await listUsers();
  return (
    <UsersPanel
      currentUserId={user.id}
      users={users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        isAdmin: u.isAdmin,
        mustChangePassword: u.mustChangePassword,
        projectCount: u.projectCount,
        joined: formatDate(u.createdAt, { timezone: "UTC", dateFormat: "YYYY/MM/DD" }),
      }))}
    />
  );
}

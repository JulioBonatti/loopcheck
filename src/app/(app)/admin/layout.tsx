import { AdminTabs } from "@/components/admin/admin-tabs";
import { requireAdminUser } from "@/server/auth/session";

/**
 * Administration (REQ-ACC-04), a page of its own (decision of 2026-10-21).
 * Non-admins get "not found"; every action checks again on the server.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminUser();

  return (
    <>
      <div className="-mx-4 -mt-4 mb-4 border-b px-4 pt-3">
        <h1 className="text-lg font-semibold">Administration</h1>
        <AdminTabs />
      </div>
      {children}
    </>
  );
}

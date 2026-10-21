import { Suspense } from "react";
import { AccountMenu } from "@/components/app/account-menu";
import { NavMenu } from "@/components/app/nav-menu";
import { requireUser } from "@/server/auth/session";
import { countMyInvitations } from "@/server/queries/members";
import { getRecentProject } from "@/server/queries/projects";

/**
 * Pages that need a signed-in user. Navigation lives in two header menus
 * (projects at the left, account at the right), so pages use the full width
 * (REQ-UI-01, as decided on 2026-10-20 and 2026-10-21).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-4 text-sm">Loading…</p>}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

async function SignedIn({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [recent, invitationCount] = await Promise.all([
    getRecentProject(user.id),
    countMyInvitations(user.email),
  ]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-background sticky top-0 z-10 flex h-11 items-center gap-2 border-b px-2">
        <NavMenu recent={recent} />
        <span className="font-semibold tracking-tight">LoopCheck</span>
        <div className="ml-auto">
          <AccountMenu
            name={`${user.firstName} ${user.lastName}`}
            email={user.email}
            invitationCount={invitationCount}
          />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}

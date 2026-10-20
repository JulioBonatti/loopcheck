import { Suspense } from "react";
import { NavMenu } from "@/components/app/nav-menu";
import { requireUser } from "@/server/auth/session";
import { listMyProjectsOnce } from "@/server/queries/projects";

/**
 * Pages that need a signed-in user. The navigation lives in a menu at the
 * header's left corner, so pages use the full width (REQ-UI-01, as decided on
 * 2026-10-20).
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
  const projects = await listMyProjectsOnce(user.id);
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-background sticky top-0 z-10 flex h-11 items-center gap-2 border-b px-2">
        <NavMenu projects={projects} />
        <span className="font-semibold tracking-tight">LoopCheck</span>
        <span className="text-muted-foreground ml-auto pr-2 text-sm">
          {user.firstName} {user.lastName}
        </span>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}

import { Suspense } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";

/**
 * Pages that need a signed-in user. The session is checked here on every
 * request; the full app shell with the sidebar comes in step 5.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-6 text-sm">Loading…</p>}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

async function SignedIn({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <span className="font-semibold">LoopCheck</span>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.firstName} {user.lastName}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";

/** Centered card for the sign-in and sign-up pages. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <h1 className="text-2xl font-semibold tracking-tight">LoopCheck</h1>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

/** Already signed in: go straight to the app. */
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Set a new password · LoopCheck" };

/** Forced password change after an admin temporary password (REQ-AUTH-07). */
export default function ChangePasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">LoopCheck</h1>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            You signed in with a temporary password. Choose a new one to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <OnlyWhenRequired />
          </Suspense>
          <ChangePasswordForm currentLabel="Temporary password" />
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Nothing to do here without a pending forced change. Same destination as
 * the action after a successful change, so the two redirects never disagree.
 */
async function OnlyWhenRequired() {
  const user = await requireUser({ allowPendingPasswordChange: true });
  if (!user.mustChangePassword) redirect("/");
  return null;
}

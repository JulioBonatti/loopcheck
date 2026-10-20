"use client";

import { useActionState } from "react";
import { type ChangePasswordState, changePasswordAction } from "@/app/(app)/account/actions";
import { FormField } from "@/components/auth/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** REQ-ACC-03, REQ-AUTH-06. */
export function ChangePasswordForm({
  currentLabel = "Current password",
}: {
  currentLabel?: string;
}) {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );
  const fieldErrors = state.error?.fieldErrors ?? {};
  const formError = Object.keys(fieldErrors).length === 0 ? state.error?.message : undefined;

  return (
    <form action={action} className="grid gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {state.done && (
        <Alert>
          <AlertDescription>
            Password changed. Your other sessions were signed out.
          </AlertDescription>
        </Alert>
      )}
      <FormField
        name="currentPassword"
        label={currentLabel}
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors.currentPassword}
      />
      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors.password}
      />
      <FormField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors.confirmPassword}
      />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

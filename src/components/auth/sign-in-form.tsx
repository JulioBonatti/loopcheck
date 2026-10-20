"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type AuthFormState, signInAction } from "@/app/(auth)/actions";
import { FormField } from "@/components/auth/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SignInForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInAction, {});
  const fieldErrors = state.error?.fieldErrors ?? {};
  // Field errors are shown next to the fields; anything else goes on top.
  const formError = Object.keys(fieldErrors).length === 0 ? state.error?.message : undefined;

  return (
    <form action={action} className="grid gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        defaultValue={state.values?.email}
        errors={fieldErrors.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        No account yet?{" "}
        <Link href="/sign-up" className="text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </form>
  );
}

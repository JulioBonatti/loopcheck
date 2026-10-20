"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type AuthFormState, signUpAction } from "@/app/(auth)/actions";
import { FormField } from "@/components/auth/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SignUpForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUpAction, {});
  const fieldErrors = state.error?.fieldErrors ?? {};
  const formError = Object.keys(fieldErrors).length === 0 ? state.error?.message : undefined;

  return (
    <form action={action} className="grid gap-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField
          name="firstName"
          label="First name"
          autoComplete="given-name"
          required
          autoFocus
          defaultValue={state.values?.firstName}
          errors={fieldErrors.firstName}
        />
        <FormField
          name="lastName"
          label="Last name"
          autoComplete="family-name"
          required
          defaultValue={state.values?.lastName}
          errors={fieldErrors.lastName}
        />
      </div>
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={fieldErrors.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors.password}
      />
      <FormField
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        errors={fieldErrors.confirmPassword}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

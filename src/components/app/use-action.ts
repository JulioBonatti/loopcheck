"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/services/errors";

/** Runs a Server Action in a transition; failures (and optional successes) become toasts. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  function run<T>(
    action: () => Promise<ActionResult<T>>,
    success?: string | ((data: T) => void),
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error.message);
      else if (typeof success === "string") toast.success(success);
      else success?.(result.data);
    });
  }
  return { pending, run };
}

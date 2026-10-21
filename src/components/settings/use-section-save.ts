"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionError, ActionResult } from "@/server/services/errors";

/**
 * Local state of a settings section that is saved as a whole. `dirty` is true
 * while it differs from what was loaded. After a successful save the page
 * reloads with fresh data and a new token; the editor is keyed by that token,
 * so it starts over from the saved state.
 */
export function useSectionSave<S>(initial: S, submit: (state: S) => Promise<ActionResult<void>>) {
  const [loaded] = useState(initial);
  const [state, setState] = useState(initial);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(state) !== JSON.stringify(loaded);

  function save(success: string) {
    setError(null);
    startTransition(async () => {
      const result = await submit(state);
      if (result.ok) toast.success(success);
      else setError(result.error);
    });
  }

  function discard() {
    setState(loaded);
    setError(null);
  }

  return { state, setState, dirty, pending, error, save, discard };
}

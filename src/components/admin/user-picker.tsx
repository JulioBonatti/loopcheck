"use client";

import { CheckIcon } from "lucide-react";
import { useDeferredValue, useId, useState } from "react";
import { SearchInput } from "@/components/app/search-input";
import { cn } from "cn";
import { textMatcher } from "@/lib/search";

export type PickableUser = { id: string; name: string; email: string };

/**
 * Choose one user from a list that may be long: a filter by name or e-mail
 * above a scrollable list. `label` names the list for screen readers.
 */
export function UserPicker({
  users,
  value,
  onChange,
  label,
}: {
  users: PickableUser[];
  value: string | null;
  onChange: (userId: string) => void;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const matches = textMatcher(useDeferredValue(query));
  const shown = users.filter((u) => matches(`${u.name} ${u.email}`));
  const listId = useId();

  return (
    <div className="grid gap-2">
      <SearchInput
        label={`Filter ${label.toLowerCase()}`}
        placeholder="Filter by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-controls={listId}
      />
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        className="ring-foreground/10 max-h-60 overflow-y-auto rounded-lg p-1 ring-1"
      >
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-center text-sm">
            Nobody matches “{query}”.
          </p>
        ) : (
          shown.map((u) => {
            const selected = u.id === value;
            return (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange(u.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                  "hover:bg-muted focus-visible:bg-muted",
                  selected && "bg-accent text-accent-foreground",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">{u.email}</span>
                </span>
                {selected && <CheckIcon className="size-4 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

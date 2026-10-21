"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PlusIcon } from "lucide-react";
import { saveIssueTypesAction } from "@/app/(app)/projects/settings-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IssueTypesState } from "@/server/queries/settings";
import { SaveBar } from "./save-bar";
import { SortableList } from "./sortable-list";
import { useSectionSave } from "./use-section-save";

type Row = { id?: string; tempId: string; name: string; archived: boolean };

let counter = 0;

/**
 * Project settings → Issue types (REQ-SET-04). Types are archived, never
 * deleted: an archived type leaves the Loop check options but stays on old issues.
 */
export function IssueTypesEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: IssueTypesState;
}) {
  const { state, setState, dirty, pending, error, save, discard } = useSectionSave(
    initial.types.map((t): Row => ({ ...t, tempId: t.id })),
    (rows) =>
      saveIssueTypesAction(projectId, {
        token: initial.token,
        types: rows.map(({ id, tempId, name, archived }) => ({
          ...(id ? { id } : { tempId }),
          name,
          archived,
        })),
      }),
  );

  const update = (tempId: string, changes: Partial<Row>) =>
    setState((rows) => rows.map((r) => (r.tempId === tempId ? { ...r, ...changes } : r)));

  return (
    <div className="grid max-w-2xl gap-3">
      <div className="grid">
        <SortableList items={state} getId={(r) => r.tempId} onReorder={setState}>
          {(row, handle) => {
            const name = row.name || "new type";
            return (
              <div
                role="group"
                aria-label={`Issue type ${name}`}
                className="bg-background grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-2 border-b py-1.5"
              >
                {handle}
                <Input
                  autoComplete="off"
                  aria-label={`Name of ${name}`}
                  value={row.name}
                  placeholder="Issue type name"
                  onChange={(e) => update(row.tempId, { name: e.target.value })}
                  className={row.archived ? "text-muted-foreground h-7 line-through" : "h-7"}
                />
                {row.archived ? <Badge variant="outline">Archived</Badge> : <span />}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => update(row.tempId, { archived: !row.archived })}
                >
                  {row.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                  {row.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            );
          }}
        </SortableList>
      </div>
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() =>
          setState((rows) => [...rows, { tempId: `new-${++counter}`, name: "", archived: false }])
        }
      >
        <PlusIcon />
        Add issue type
      </Button>
      <SaveBar
        dirty={dirty}
        pending={pending}
        error={error}
        onSave={() => save("Issue types saved.")}
        onDiscard={discard}
      />
    </div>
  );
}

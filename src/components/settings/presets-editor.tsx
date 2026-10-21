"use client";

import { PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { savePresetsAction } from "@/app/(app)/projects/settings-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IssueTypeRow, PresetsState } from "@/server/queries/settings";
import { SaveBar } from "./save-bar";
import { SortableList } from "./sortable-list";
import { useSectionSave } from "./use-section-save";

type Row = { id?: string; tempId: string; issueTypeId: string; text: string };

let counter = 0;

/** Project settings → Presets: recurring issue texts (REQ-SET-05). */
export function PresetsEditor({
  projectId,
  initial,
  types,
}: {
  projectId: string;
  initial: PresetsState;
  types: IssueTypeRow[];
}) {
  const start = {
    rows: initial.presets.map((p): Row => ({ ...p, tempId: p.id })),
    deletedIds: [] as string[],
  };
  const { state, setState, dirty, pending, error, save, discard } = useSectionSave(start, (s) =>
    savePresetsAction(projectId, {
      token: initial.token,
      presets: s.rows.map(({ id, tempId, issueTypeId, text }) => ({
        ...(id ? { id } : { tempId }),
        issueTypeId,
        text,
      })),
      deletedIds: s.deletedIds,
    }),
  );
  const archived = new Set(types.filter((t) => t.archived).map((t) => t.id));
  const firstActive = types.find((t) => !t.archived)?.id ?? "";

  const update = (tempId: string, changes: Partial<Row>) =>
    setState((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.tempId === tempId ? { ...r, ...changes } : r)),
    }));

  return (
    <div className="grid gap-3">
      <div className="grid">
        {state.rows.length === 0 && (
          <p className="text-muted-foreground py-2 text-sm">
            No presets yet. Presets fill the type and text of a new issue in one click.
          </p>
        )}
        <SortableList
          items={state.rows}
          getId={(r) => r.tempId}
          onReorder={(rows) => setState((s) => ({ ...s, rows }))}
        >
          {(row, handle, index) => {
            // Archived types stay selectable only on presets that already use them.
            const items = types
              .filter((t) => !t.archived || t.id === row.issueTypeId)
              .map((t) => ({ value: t.id, label: t.archived ? `${t.name} (archived)` : t.name }));
            return (
              <div
                role="group"
                aria-label={`Preset ${index + 1}`}
                className="bg-background grid grid-cols-[1.5rem_11rem_1fr_1.5rem_2rem] items-center gap-2 border-b py-1.5"
              >
                {handle}
                <Select
                  value={row.issueTypeId}
                  items={items}
                  onValueChange={(v) => v && update(row.tempId, { issueTypeId: v })}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full"
                    aria-label={`Type of preset ${index + 1}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  autoComplete="off"
                  aria-label={`Text of preset ${index + 1}`}
                  value={row.text}
                  placeholder="e.g. Loose terminal in the junction box"
                  onChange={(e) => update(row.tempId, { text: e.target.value })}
                  className="h-7"
                />
                {archived.has(row.issueTypeId) ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="text-destructive flex justify-center" />}
                      aria-label="Archived type"
                    >
                      <TriangleAlertIcon className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Its issue type is archived: this preset is not offered in the Loop check.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span />
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove preset ${index + 1}`}
                  onClick={() =>
                    setState((s) => ({
                      rows: s.rows.filter((r) => r.tempId !== row.tempId),
                      deletedIds: row.id ? [...s.deletedIds, row.id] : s.deletedIds,
                    }))
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          }}
        </SortableList>
      </div>
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={!firstActive}
        onClick={() =>
          setState((s) => ({
            ...s,
            rows: [...s.rows, { tempId: `new-${++counter}`, issueTypeId: firstActive, text: "" }],
          }))
        }
      >
        <PlusIcon />
        Add preset
      </Button>
      <SaveBar
        dirty={dirty}
        pending={pending}
        error={error}
        onSave={() => save("Presets saved.")}
        onDiscard={discard}
      />
    </div>
  );
}

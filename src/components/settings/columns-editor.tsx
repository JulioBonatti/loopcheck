"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { saveColumnsAction } from "@/app/(app)/projects/settings-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALWAYS_REQUIRED, type FieldDataType, fieldDataTypes } from "@/lib/fields";
import type { ColumnsState, FieldRow } from "@/server/queries/settings";
import { SaveBar } from "./save-bar";
import { SortableList } from "./sortable-list";
import { useSectionSave } from "./use-section-save";

type Row = Omit<FieldRow, "id" | "key"> & { id?: string; key?: string; tempId: string };

const TOGGLES = [
  { name: "required", label: "Required" },
  { name: "groupable", label: "Groupable" },
  { name: "testRelevant", label: "Test relevant" },
  { name: "showInIoList", label: "IO list" },
  { name: "showInLoopCheck", label: "Loop check" },
] as const;

const TYPE_ITEMS = fieldDataTypes.map((t) => ({
  value: t,
  label: { text: "Text", number: "Number", boolean: "Yes / no", date: "Date" }[t],
}));

const GRID =
  "grid grid-cols-[1.5rem_minmax(10rem,1fr)_8rem_repeat(5,5.5rem)_2rem] items-center gap-2";

let counter = 0;
const newTempId = () => `new-${++counter}`;

/** Project settings → Columns (REQ-SET-03). */
export function ColumnsEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ColumnsState;
}) {
  const start = {
    rows: initial.fields.map((f): Row => ({ ...f, tempId: f.id })),
    deletedIds: [] as string[],
    primaryGroup: initial.fields.find((f) => f.key === initial.primaryGroupFieldKey)?.id ?? null,
  };
  const { state, setState, dirty, pending, error, save, discard } = useSectionSave(start, (s) =>
    saveColumnsAction(projectId, {
      token: initial.token,
      fields: s.rows.map(
        ({
          id,
          tempId,
          label,
          dataType,
          required,
          groupable,
          testRelevant,
          showInIoList,
          showInLoopCheck,
        }) => ({
          ...(id ? { id } : { tempId }),
          label,
          dataType,
          required,
          groupable,
          testRelevant,
          showInIoList,
          showInLoopCheck,
        }),
      ),
      deletedIds: s.deletedIds,
      primaryGroup: s.primaryGroup,
    }),
  );
  const { rows, primaryGroup } = state;

  function update(tempId: string, changes: Partial<Row>) {
    setState((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.tempId === tempId ? { ...r, ...changes } : r)),
      // A column that stops being groupable cannot stay the primary grouping.
      primaryGroup:
        changes.groupable === false && s.primaryGroup === tempId ? null : s.primaryGroup,
    }));
  }

  function remove(row: Row) {
    setState((s) => ({
      ...s,
      rows: s.rows.filter((r) => r.tempId !== row.tempId),
      deletedIds: row.id ? [...s.deletedIds, row.id] : s.deletedIds,
      primaryGroup: s.primaryGroup === row.tempId ? null : s.primaryGroup,
    }));
  }

  function add() {
    const tempId = newTempId();
    setState((s) => ({
      ...s,
      rows: [
        ...s.rows,
        {
          tempId,
          label: "",
          source: "attribute",
          dataType: "text",
          required: false,
          groupable: false,
          testRelevant: false,
          showInIoList: true,
          showInLoopCheck: false,
        },
      ],
    }));
  }

  const groupItems = [
    { value: "none", label: "None" },
    ...rows
      .filter((r) => r.groupable)
      .map((r) => ({ value: r.tempId, label: r.label || "(no label)" })),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="primary-group">Primary grouping (Area)</Label>
          <Select
            value={primaryGroup ?? "none"}
            items={groupItems}
            onValueChange={(v) =>
              setState((s) => ({ ...s, primaryGroup: v === "none" || !v ? null : v }))
            }
          >
            <SelectTrigger id="primary-group" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupItems.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-muted-foreground max-w-xl pb-1 text-xs">
          Only groupable columns can be the primary grouping. It is the “Area” of the Loop check and
          of the reports.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-fit">
          <div className={`${GRID} text-muted-foreground border-b pb-1.5 text-xs font-medium`}>
            <span />
            <span>Label</span>
            <span>Type</span>
            {TOGGLES.map((t) => (
              <span key={t.name} className="text-center">
                {t.label}
              </span>
            ))}
            <span />
          </div>
          <SortableList
            items={rows}
            getId={(r) => r.tempId}
            onReorder={(next) => setState((s) => ({ ...s, rows: next }))}
          >
            {(row, handle) => {
              const builtin = row.source === "builtin";
              const name = row.label || "new column";
              return (
                <div
                  className={`${GRID} bg-background border-b py-1.5`}
                  role="group"
                  aria-label={`Column ${name}`}
                >
                  {handle}
                  <div className="flex items-center gap-2">
                    <Input
                      autoComplete="off"
                      aria-label={`Label of ${name}`}
                      value={row.label}
                      placeholder="Column label"
                      onChange={(e) => update(row.tempId, { label: e.target.value })}
                      className="h-7"
                    />
                    {builtin && <Badge variant="outline">Built-in</Badge>}
                  </div>
                  <Select
                    value={row.dataType}
                    items={TYPE_ITEMS}
                    disabled={builtin}
                    onValueChange={(v) => v && update(row.tempId, { dataType: v as FieldDataType })}
                  >
                    <SelectTrigger size="sm" className="w-full" aria-label={`Type of ${name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_ITEMS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {TOGGLES.map((t) => {
                    const locked =
                      t.name === "required" && !!row.key && ALWAYS_REQUIRED.has(row.key);
                    return (
                      <div key={t.name} className="flex justify-center">
                        <Checkbox
                          aria-label={`${t.label} for ${name}`}
                          checked={locked || row[t.name]}
                          disabled={locked}
                          onCheckedChange={(checked) =>
                            update(row.tempId, { [t.name]: checked === true })
                          }
                        />
                      </div>
                    );
                  })}
                  {builtin ? (
                    <span />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${name}`}
                      onClick={() => remove(row)}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              );
            }}
          </SortableList>
        </div>
      </div>

      <Button variant="outline" className="justify-self-start" onClick={add}>
        <PlusIcon />
        Add column
      </Button>

      <SaveBar
        dirty={dirty}
        pending={pending}
        error={error}
        onSave={() => save("Columns saved.")}
        onDiscard={() => {
          discard();
          toast.message("Changes discarded.");
        }}
      />
    </div>
  );
}

"use client";

import { saveProceduresAction } from "@/app/(app)/projects/settings-actions";
import { useProjectDates } from "@/components/project/project-context";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProceduresState } from "@/server/queries/settings";
import { SaveBar } from "./save-bar";
import { useSectionSave } from "./use-section-save";

/**
 * Project settings → Test procedures (REQ-SET-06): one text per IO type of the
 * IO list. Always the latest text, no history. Clearing a text removes it.
 */
export function ProceduresEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProceduresState;
}) {
  const dates = useProjectDates();
  const { state, setState, dirty, pending, error, save, discard } = useSectionSave(
    Object.fromEntries(initial.procedures.map((p) => [p.ioType, p.text])),
    (texts) => saveProceduresAction(projectId, { token: initial.token, procedures: texts }),
  );

  if (initial.procedures.length === 0) {
    return (
      <p className="text-muted-foreground max-w-xl text-sm">
        Test procedures are written per IO type (AI, DI, RTD…). The fields appear here once the IO
        list is imported.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(26rem,1fr))] gap-3">
        {initial.procedures.map((p) => (
          <div key={p.ioType} className="ring-foreground/10 grid gap-1.5 rounded-lg p-3 ring-1">
            <div className="flex items-center gap-2">
              <Label htmlFor={`procedure-${p.ioType}`} className="font-mono">
                {p.ioType}
              </Label>
              {!p.inIoList && <Badge variant="outline">Not in the IO list</Badge>}
              {p.updatedBy && p.updatedAt && (
                <span className="text-muted-foreground ml-auto text-xs">
                  Edited by {p.updatedBy} on {dates.dateTime(p.updatedAt)}
                </span>
              )}
            </div>
            <Textarea
              id={`procedure-${p.ioType}`}
              rows={4}
              autoComplete="off"
              value={state[p.ioType] ?? ""}
              placeholder={`How ${p.ioType} loops are tested in this project…`}
              onChange={(e) => setState((s) => ({ ...s, [p.ioType]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        pending={pending}
        error={error}
        onSave={() => save("Test procedures saved.")}
        onDiscard={discard}
      />
    </div>
  );
}

"use client";

import { useId, useSyncExternalStore } from "react";
import { FormField } from "@/components/auth/form-field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dateFormats } from "@/lib/dates";
import type { FieldErrors } from "@/server/services/errors";

const DATE_FORMAT_ITEMS = dateFormats.map((f) => ({ value: f, label: f }));

let zones: string[] | undefined;
const NO_ZONES: string[] = [];
/** Browser-only: the server's list may differ and break hydration. */
function useTimeZones(): string[] {
  return useSyncExternalStore(
    () => () => {},
    () => (zones ??= Intl.supportedValuesOf("timeZone")),
    () => NO_ZONES,
  );
}

export type ProjectFormValues = {
  clientName: string;
  code: string;
  description: string;
  fieldStartDate: string;
  timezone: string;
  dateFormat: string;
};

/** The project fields of REQ-PROJ-01 / REQ-SET-01, for create and edit. */
export function ProjectFormFields({
  values,
  errors = {},
  autoFocus,
}: {
  values: ProjectFormValues;
  errors?: FieldErrors;
  autoFocus?: boolean;
}) {
  const listId = useId();
  // Every IANA zone the browser knows; the input below searches it.
  const timeZones = useTimeZones();

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <FormField
          name="clientName"
          label="Client name"
          required
          autoFocus={autoFocus}
          defaultValue={values.clientName}
          errors={errors.clientName}
        />
        <FormField
          name="code"
          label="Project code"
          required
          defaultValue={values.code}
          errors={errors.code}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">
          Description <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={values.description}
          aria-invalid={errors.description ? true : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField
          name="fieldStartDate"
          label="Field activities start date"
          type="date"
          required
          defaultValue={values.fieldStartDate}
          errors={errors.fieldStartDate}
        />
        <FormField
          name="timezone"
          label="Time zone"
          list={listId}
          required
          autoComplete="off"
          defaultValue={values.timezone}
          errors={errors.timezone}
        />
        <datalist id={listId}>
          {timeZones.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="dateFormat">Date format</Label>
          <Select name="dateFormat" defaultValue={values.dateFormat} items={DATE_FORMAT_ITEMS}>
            <SelectTrigger id="dateFormat" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

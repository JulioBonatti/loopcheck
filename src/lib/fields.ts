/**
 * IO list columns every project starts with (SPEC §4.2). Builtin fields are
 * real columns of `tags`; projects can rename, hide or reorder them.
 */

export type FieldDataType = "text" | "number" | "boolean" | "date";

export type BuiltinField = {
  key: string;
  label: string;
  dataType: FieldDataType;
  /** `tag`, `description` and `io_type` are always required (not editable). */
  required: boolean;
  testRelevant: boolean;
};

export const BUILTIN_FIELDS: readonly BuiltinField[] = [
  { key: "tag", label: "Tag", dataType: "text", required: true, testRelevant: false },
  {
    key: "description",
    label: "Description",
    dataType: "text",
    required: true,
    testRelevant: false,
  },
  { key: "io_type", label: "IO type", dataType: "text", required: true, testRelevant: true },
  { key: "loop", label: "Loop", dataType: "text", required: false, testRelevant: false },
  { key: "pid", label: "P&ID", dataType: "text", required: false, testRelevant: false },
  { key: "range_min", label: "Range min", dataType: "number", required: false, testRelevant: true },
  { key: "range_max", label: "Range max", dataType: "number", required: false, testRelevant: true },
  { key: "unit", label: "Unit", dataType: "text", required: false, testRelevant: true },
];

/** P-06: issue types created with every project. */
export const DEFAULT_ISSUE_TYPES = ["Field", "Wiring", "Logic", "Other"] as const;

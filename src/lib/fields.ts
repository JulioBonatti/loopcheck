/**
 * IO list columns every project starts with (SPEC §4.2). Builtin fields are
 * real columns of `tags`; projects can rename, hide or reorder them.
 */

export const fieldDataTypes = ["text", "number", "boolean", "date"] as const;
export type FieldDataType = (typeof fieldDataTypes)[number];

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

/** `tag`, `description` and `io_type` are always required (SPEC §4.2). */
export const ALWAYS_REQUIRED = new Set(["tag", "description", "io_type"]);

export const BUILTIN_KEYS = new Set(BUILTIN_FIELDS.map((f) => f.key));

/**
 * A stable key for a new attribute column, from its label: lower-case ASCII
 * words joined by `_`, unique among `taken` (builtin keys included).
 */
export function fieldKeyFromLabel(label: string, taken: Iterable<string>): string {
  const used = new Set([...taken, ...BUILTIN_KEYS]);
  const base =
    label
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "column";
  // Keys must not start with a digit (they are used as JSON object keys and in code).
  const key = /^[0-9]/.test(base) ? `c_${base}` : base;
  if (!used.has(key)) return key;
  for (let n = 2; ; n++) if (!used.has(`${key}_${n}`)) return `${key}_${n}`;
}

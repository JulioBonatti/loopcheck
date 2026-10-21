/**
 * IO list values by data type (SPEC §4.2). Attribute values live in
 * `tags.attributes` (JSON) already converted: numbers as numbers, booleans as
 * booleans, dates as `YYYY-MM-DD`, text as trimmed strings. Empty is `null`.
 */
import type { FieldDataType } from "./fields";
import { isIsoDate } from "./dates";

export type FieldValue = string | number | boolean | null;

export type Conversion = { ok: true; value: FieldValue } | { ok: false };

const TRUE = new Set(["true", "yes", "y", "1", "x", "sim", "s"]);
const FALSE = new Set(["false", "no", "n", "0", "nao", "não"]);

/** Converts a stored or typed value to `type`; `ok: false` when it cannot. */
export function convertValue(value: unknown, type: FieldDataType): Conversion {
  if (value === null || value === undefined) return { ok: true, value: null };
  const text = String(value).trim();
  if (text === "") return { ok: true, value: null };

  switch (type) {
    case "text":
      return { ok: true, value: text };
    case "number": {
      if (typeof value === "number") return { ok: true, value };
      // Accept a decimal comma ("4,5") as well as a point.
      const n = Number(text.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      const lower = text.toLowerCase();
      if (TRUE.has(lower)) return { ok: true, value: true };
      if (FALSE.has(lower)) return { ok: true, value: false };
      return { ok: false };
    }
    case "date":
      return isIsoDate(text) ? { ok: true, value: text } : { ok: false };
  }
}

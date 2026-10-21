import { describe, expect, it } from "vitest";
import { convertValue } from "@/lib/values";

describe("convertValue", () => {
  it("treats empty as null for every type", () => {
    for (const type of ["text", "number", "boolean", "date"] as const) {
      expect(convertValue("  ", type)).toEqual({ ok: true, value: null });
      expect(convertValue(null, type)).toEqual({ ok: true, value: null });
    }
  });

  it("converts numbers, with a point or a decimal comma", () => {
    expect(convertValue("4.5", "number")).toEqual({ ok: true, value: 4.5 });
    expect(convertValue("4,5", "number")).toEqual({ ok: true, value: 4.5 });
    expect(convertValue("-20", "number")).toEqual({ ok: true, value: -20 });
    expect(convertValue(7, "number")).toEqual({ ok: true, value: 7 });
    expect(convertValue("abc", "number")).toEqual({ ok: false });
  });

  it("converts booleans from common spellings", () => {
    expect(convertValue("Yes", "boolean")).toEqual({ ok: true, value: true });
    expect(convertValue("X", "boolean")).toEqual({ ok: true, value: true });
    expect(convertValue("0", "boolean")).toEqual({ ok: true, value: false });
    expect(convertValue("maybe", "boolean")).toEqual({ ok: false });
  });

  it("accepts ISO dates only", () => {
    expect(convertValue("2026-10-21", "date")).toEqual({ ok: true, value: "2026-10-21" });
    expect(convertValue("10/21/2026", "date")).toEqual({ ok: false });
  });

  it("turns anything into trimmed text", () => {
    expect(convertValue(" PT-1 ", "text")).toEqual({ ok: true, value: "PT-1" });
    expect(convertValue(12, "text")).toEqual({ ok: true, value: "12" });
    expect(convertValue(true, "text")).toEqual({ ok: true, value: "true" });
  });
});

import { describe, expect, it } from "vitest";
import { textMatcher } from "@/lib/search";

describe("textMatcher", () => {
  it("matches everything for an empty query", () => {
    expect(textMatcher("  ")("anything")).toBe(true);
  });

  it("ignores case and accents", () => {
    expect(textMatcher("OLEO")("Petro Óleo PO-77")).toBe(true);
    expect(textMatcher("joão")("Joao Silva")).toBe(true);
  });

  it("needs every term, in any order", () => {
    const match = textMatcher("silva joao");
    expect(match("João Silva joao@example.com")).toBe(true);
    expect(match("João Souza")).toBe(false);
  });
});

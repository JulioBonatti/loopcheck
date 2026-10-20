import { describe, expect, it } from "vitest";
import { diffFields, REDACTED } from "./audit";

describe("diffFields (REQ-AUD-01)", () => {
  it("keeps only the fields that changed", () => {
    expect(
      diffFields(
        { checkout: false, checkoutAt: null, description: "PT", version: 1 },
        { checkout: true, checkoutAt: new Date("2026-10-20T12:00:00Z"), description: "PT", version: 2 },
      ),
    ).toEqual({
      before: { checkout: false, checkoutAt: null },
      after: { checkout: true, checkoutAt: "2026-10-20T12:00:00.000Z" },
    });
  });

  it("ignores updatedAt and version", () => {
    expect(
      diffFields({ updatedAt: new Date(1), version: 1 }, { updatedAt: new Date(2), version: 2 }),
    ).toEqual({ before: {}, after: {} });
  });

  it("compares JSON values by content, whatever the key order", () => {
    expect(
      diffFields({ attributes: { a: 1, b: [1, 2] } }, { attributes: { b: [1, 2], a: 1 } }),
    ).toEqual({ before: {}, after: {} });
    expect(diffFields({ attributes: { a: 1 } }, { attributes: { a: 2 } })).toEqual({
      before: { attributes: { a: 1 } },
      after: { attributes: { a: 2 } },
    });
  });

  it("records every field on creation and removal", () => {
    expect(diffFields(null, { name: "Field", archived: false })).toEqual({
      before: null,
      after: { name: "Field", archived: false },
    });
    expect(diffFields({ name: "Field" }, null)).toEqual({ before: { name: "Field" }, after: null });
  });

  it("never records password or token hashes (REQ-AUTH-03)", () => {
    expect(
      diffFields({ passwordHash: "$argon2id$old" }, { passwordHash: "$argon2id$new" }),
    ).toEqual({ before: { passwordHash: REDACTED }, after: { passwordHash: REDACTED } });
    expect(diffFields(null, { email: "a@b.c", tokenHash: "abc" }).after).toEqual({
      email: "a@b.c",
      tokenHash: REDACTED,
    });
  });
});

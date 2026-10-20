import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ConflictError,
  describeForLog,
  ForbiddenError,
  toActionResult,
  ValidationError,
} from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toActionResult", () => {
  it("wraps the value of a successful call", async () => {
    expect(await toActionResult(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it("reports permission errors as 403 with a generic message (REQ-PERM-01)", async () => {
    const error = new ForbiddenError();
    expect(error.httpStatus).toBe(403);
    expect(
      await toActionResult(async () => {
        throw error;
      }),
    ).toEqual({
      ok: false,
      error: { code: "forbidden", message: "You do not have permission to do this." },
    });
  });

  it("returns Zod messages per field", async () => {
    const parsed = z.object({ code: z.string().min(1, "Required") }).safeParse({ code: "" });
    const result = await toActionResult(async () => {
      if (!parsed.success) throw ValidationError.fromZod(parsed.error);
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation", fieldErrors: { code: ["Required"] } },
    });
  });

  it("returns who changed a row on conflict (REQ-RT-04)", async () => {
    const changedAt = new Date("2026-10-20T12:00:00Z");
    const result = await toActionResult(async () => {
      throw new ConflictError("tag", { changedBy: "Ana Lima", changedAt });
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "conflict",
        conflict: { entity: "tag", changedBy: "Ana Lima", changedAt: changedAt.toISOString() },
      },
    });
  });

  it("hides unexpected errors from the user", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await toActionResult(async () => {
      throw new Error("connection refused at 10.0.0.5");
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "internal", message: "Something went wrong. Please try again." },
    });
  });
});

describe("describeForLog", () => {
  it("drops query parameters, which may hold hashes (rule 9)", () => {
    const cause = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const error = new Error('Failed query: insert into "users"\nparams: a@b.c,$argon2id$secret', {
      cause,
    });
    const text = describeForLog(error);
    expect(text).not.toContain("argon2id");
    expect(text).toContain('Failed query: insert into "users"');
    expect(text).toContain("[23505]: duplicate key value");
  });
});

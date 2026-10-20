import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDate,
  formatDateTime,
  isIsoDate,
  isValidTimeZone,
  todayIn,
  toIsoDateIn,
} from "@/lib/dates";

const chicagoIso = { timezone: "America/Chicago", dateFormat: "YYYY/MM/DD" } as const;
const chicagoUs = { timezone: "America/Chicago", dateFormat: "MM/DD/YYYY" } as const;

// 2026-10-21 03:30 UTC is still the evening of 2026-10-20 in Chicago (UTC-5)
const lateEvening = new Date("2026-10-21T03:30:00Z");

describe("time zones", () => {
  it("validates IANA names", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("takes the calendar date in the project time zone", () => {
    expect(toIsoDateIn(lateEvening, "America/Chicago")).toBe("2026-10-20");
    expect(toIsoDateIn(lateEvening, "UTC")).toBe("2026-10-21");
    expect(todayIn("America/Sao_Paulo", lateEvening)).toBe("2026-10-21");
  });
});

describe("formatDate", () => {
  it("formats instants in the project time zone and format", () => {
    expect(formatDate(lateEvening, chicagoIso)).toBe("2026/10/20");
    expect(formatDate(lateEvening, chicagoUs)).toBe("10/20/2026");
  });

  it("formats calendar dates without shifting them", () => {
    expect(formatDate("2026-01-05", chicagoIso)).toBe("2026/01/05");
    expect(formatDate("2026-01-05", { timezone: "Pacific/Kiritimati", dateFormat: "MM/DD/YYYY" })).toBe(
      "01/05/2026",
    );
  });
});

describe("formatDateTime", () => {
  it("uses 24-hour time in the project time zone", () => {
    expect(formatDateTime(lateEvening, chicagoIso)).toBe("2026/10/20 22:30");
    expect(formatDateTime(new Date("2026-03-01T05:07:00Z"), chicagoUs)).toBe("02/28/2026 23:07");
  });

  it("follows daylight saving time", () => {
    // Chicago is UTC-6 in January
    expect(formatDateTime(new Date("2026-01-15T12:00:00Z"), chicagoIso)).toBe("2026/01/15 06:00");
  });
});

describe("calendar dates", () => {
  it("recognizes valid ISO dates only", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026/02/28")).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

/**
 * Dates (ARQ-03, rule 8). Timestamps are stored in UTC and shown in the
 * project time zone and date format. Calendar dates (`date` columns such as
 * the field start date) are ISO strings `YYYY-MM-DD` with no time zone.
 */

export const dateFormats = ["YYYY/MM/DD", "MM/DD/YYYY"] as const;
export type DateFormat = (typeof dateFormats)[number];

export type ProjectDateSettings = { timezone: string; dateFormat: DateFormat };

/** Calendar date as stored in `date` columns. */
export type IsoDate = `${number}-${number}-${number}`;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  // Rejects 2026-02-30 and the like
  const d = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return d.toISOString().startsWith(value);
}

/** Wall-clock parts of an instant in a time zone. */
function partsIn(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** The calendar date of an instant in a time zone. */
export function toIsoDateIn(instant: Date, timezone: string): IsoDate {
  const { year, month, day } = partsIn(instant, timezone);
  return `${year}-${month}-${day}` as IsoDate;
}

/** Today in the project time zone (default field start date, PDF end date). */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
  return toIsoDateIn(now, timezone);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) as IsoDate;
}

function applyFormat(year: string, month: string, day: string, format: DateFormat): string {
  return format === "MM/DD/YYYY" ? `${month}/${day}/${year}` : `${year}/${month}/${day}`;
}

/**
 * A calendar date (`YYYY-MM-DD`) or the date of an instant, in the project
 * format. Instants are first converted to the project time zone.
 */
export function formatDate(value: Date | IsoDate, settings: ProjectDateSettings): string {
  const iso = value instanceof Date ? toIsoDateIn(value, settings.timezone) : value;
  const [year, month, day] = iso.split("-");
  return applyFormat(year, month, day, settings.dateFormat);
}

/** An instant as date and 24-hour time in the project time zone. */
export function formatDateTime(instant: Date, settings: ProjectDateSettings): string {
  const { year, month, day, hour, minute } = partsIn(instant, settings.timezone);
  return `${applyFormat(year, month, day, settings.dateFormat)} ${hour}:${minute}`;
}

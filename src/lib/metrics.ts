/**
 * Progress metrics (SPEC §4.5). Callers pass counts of countable tags only:
 * active, in scope and not cleared (rule 7).
 */

/** Share of `part` in `total`, from 0 to 1; null when there is nothing to count. */
export function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

/**
 * Whole percent, rounded down so an unfinished list never shows 100%.
 * "—" when there are no countable tags.
 */
export function formatPercent(part: number, total: number): string {
  const r = ratio(part, total);
  return r === null ? "—" : `${Math.floor(r * 100)}%`;
}

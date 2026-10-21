/** Client-side text filters: case- and accent-insensitive, every term must match. */

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** A predicate for `query`; an empty query matches everything. */
export function textMatcher(query: string): (text: string) => boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return (text) => {
    const haystack = normalize(text);
    return terms.every((t) => haystack.includes(t));
  };
}

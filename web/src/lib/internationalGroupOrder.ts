/**
 * Deterministic ordering for international group-stage labels so UI never flips
 * (e.g. Group B above Group A) when fixture iteration order changes.
 */
function extractGroupSortKey(label: string): string {
  const t = label.trim();
  if (!t) return "";
  const groupWord = t.match(/^group\s*(.+)$/i);
  const rest = groupWord ? groupWord[1]!.trim() : t;
  const num = rest.match(/^(\d+)$/);
  if (num) return `N:${num[1]!.padStart(6, "0")}`;
  const alnum = rest.match(/^([A-Za-z])(?:\s|$)/);
  if (alnum) return `L:${alnum[1]!.toUpperCase()}`;
  return `S:${rest.toUpperCase()}`;
}

export function compareInternationalGroupNames(a: string, b: string): number {
  const ka = extractGroupSortKey(a);
  const kb = extractGroupSortKey(b);
  if (ka !== kb) return ka.localeCompare(kb, undefined, { numeric: true });
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortInternationalGroupNames(groups: string[]): string[] {
  return [...groups].sort(compareInternationalGroupNames);
}

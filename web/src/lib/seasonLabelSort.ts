/**
 * Sort human-readable season labels so newer / higher numbers appear first
 * (avoids string order: "Season 10" before "Season 9").
 */
export function seasonLabelRank(label: string): number {
  const s = label.trim();
  const m = s.match(/season\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const y = s.match(/20\d{2}/);
  if (y) return parseInt(y[0], 10);
  const nums = s.match(/\d+/g);
  if (nums?.length) return Math.max(...nums.map((n) => parseInt(n, 10)));
  return 0;
}

/** Newest / highest season first. */
export function compareSeasonLabelsDesc(a: string, b: string): number {
  return seasonLabelRank(b) - seasonLabelRank(a);
}

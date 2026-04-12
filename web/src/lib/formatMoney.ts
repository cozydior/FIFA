/** Formats pound amounts compactly: £12.3M, £450K, £1,234 */
export function formatMoneyPounds(value: number): string {
  const v = Math.abs(Number(value) || 0);
  const sign = value < 0 ? "-" : "";
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    const rounded = Math.round(m * 10) / 10;
    const s = Number.isInteger(rounded) ? String(Math.round(rounded)) : rounded.toFixed(1);
    return `${sign}£${s}M`;
  }
  if (v >= 10_000) {
    const k = v / 1_000;
    const rounded = Math.round(k * 10) / 10;
    const s = Number.isInteger(rounded) ? String(Math.round(rounded)) : rounded.toFixed(1);
    return `${sign}£${s}K`;
  }
  return `${sign}£${Math.round(v).toLocaleString("en-GB")}`;
}

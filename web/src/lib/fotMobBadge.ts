/** FotMob-style rating badge (light-mode friendly). */
export function fotMobBadgeClass(v: number): string {
  if (v >= 9)
    return "inline-flex rounded bg-blue-600 px-2 py-0.5 text-xs font-bold text-white";
  if (v >= 7)
    return "inline-flex rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white";
  if (v >= 5.5)
    return "inline-flex rounded bg-orange-500 px-2 py-0.5 text-xs font-bold text-white";
  return "inline-flex rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white";
}

export type MarketTrend = "rising" | "falling" | "flat" | "unknown";

export function marketTrend(
  previous: number | null | undefined,
  current: number,
): MarketTrend {
  if (previous == null || Number.isNaN(previous)) return "unknown";
  if (current > previous) return "rising";
  if (current < previous) return "falling";
  return "flat";
}

export function marketTrendLabel(
  previous: number | null | undefined,
  current: number,
): string {
  const t = marketTrend(previous, current);
  if (t === "unknown") return "—";
  if (t === "flat") return "Flat";
  const pct =
    previous && previous !== 0
      ? Math.round(((current - previous) / previous) * 1000) / 10
      : null;
  if (pct == null) return t === "rising" ? "Rising" : "Falling";
  return t === "rising" ? `↑ ${pct}%` : `↓ ${Math.abs(pct)}%`;
}

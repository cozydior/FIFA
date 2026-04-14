/** 1 = best (e.g. #1 MV). Splits `total` into three bands: top third green, middle orange, bottom red. */
export type RankThirdTier = "top" | "mid" | "bottom";

export function rankThirdTier(rank: number, total: number): RankThirdTier {
  if (total <= 0 || rank < 1 || rank > total) return "mid";
  const topEnd = Math.ceil(total / 3);
  const midEnd = Math.ceil((2 * total) / 3);
  if (rank <= topEnd) return "top";
  if (rank <= midEnd) return "mid";
  return "bottom";
}

export function rankThirdBubbleClass(tier: RankThirdTier): string {
  switch (tier) {
    case "top":
      return "bg-emerald-600 shadow-sm ring-1 ring-emerald-800/25";
    case "mid":
      return "bg-amber-500 shadow-sm ring-1 ring-amber-700/25";
    case "bottom":
      return "bg-red-600 shadow-sm ring-1 ring-red-800/25";
    default:
      return "bg-slate-500";
  }
}

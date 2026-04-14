import { compareSeasonLabelsDesc } from "@/lib/seasonLabelSort";

/**
 * Season label immediately before `currentSeason` in app order (newer seasons rank higher).
 * Uses the union of known history labels plus current so rookies still resolve “prior” when
 * their only history row is the current season.
 */
export function priorSeasonLabel(
  currentSeason: string,
  allSeasonLabels: string[],
): string | null {
  const unique = [...new Set([...allSeasonLabels, currentSeason])].filter(Boolean);
  unique.sort(compareSeasonLabelsDesc);
  const idx = unique.indexOf(currentSeason);
  if (idx < 0 || idx >= unique.length - 1) return null;
  return unique[idx + 1] ?? null;
}

export type MvHistRow = {
  player_id: string;
  season_label: string;
  market_value: number;
};

/** Map player id → MV stored for the season before `currentSeason` (from history rows). */
export function priorSeasonMvByPlayer(
  historyRows: MvHistRow[],
  currentSeason: string | null,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (!currentSeason?.trim()) return out;

  const byPlayer = new Map<string, MvHistRow[]>();
  for (const r of historyRows) {
    const pid = r.player_id;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push(r);
  }

  for (const [pid, rows] of byPlayer) {
    const labels = rows.map((x) => x.season_label);
    const prior = priorSeasonLabel(currentSeason, labels);
    if (!prior) {
      out.set(pid, null);
      continue;
    }
    const hit = rows.find((x) => x.season_label === prior);
    out.set(pid, hit != null ? Number(hit.market_value) : null);
  }
  return out;
}

/** Prior-season MV for one player’s history rows (same season ordering as rankings). */
export function priorSeasonMvForPlayerHistory(
  historyRows: { season_label: string; market_value: number }[],
  currentSeason: string | null,
): number | null {
  if (!currentSeason?.trim()) return null;
  const labels = historyRows.map((x) => x.season_label);
  const prior = priorSeasonLabel(currentSeason, labels);
  if (!prior) return null;
  const hit = historyRows.find((x) => x.season_label === prior);
  return hit != null ? Number(hit.market_value) : null;
}

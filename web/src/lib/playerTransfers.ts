import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamMini = { id: string; name: string; logo_url: string | null };

export type PlayerTransferTxRow = {
  id: string;
  team_id: string;
  season_label: string;
  amount: number;
  category: string;
  note: string | null;
  created_at: string;
  teams: TeamMini | TeamMini[] | null;
};

/** Transfer / movement rows mentioning this player (club books). */
export async function fetchPlayerTransferTransactions(
  supabase: SupabaseClient,
  playerName: string,
): Promise<PlayerTransferTxRow[]> {
  const safe = playerName.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const { data, error } = await supabase
    .from("team_transactions")
    .select("id, team_id, season_label, amount, category, note, created_at, teams(id, name, logo_url)")
    .ilike("note", `%${safe}%`)
    .in("category", ["transfer_in", "transfer_out", "release", "free_agent_pickup"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as PlayerTransferTxRow[];
}

/** Human-readable label + colour key for a transaction category. */
export function txCategoryDisplay(category: string): {
  label: string;
  colour: "green" | "amber" | "red" | "slate";
} {
  switch (category) {
    case "transfer_in":
      return { label: "Bought", colour: "green" };
    case "transfer_out":
      return { label: "Sold", colour: "amber" };
    case "free_agent_pickup":
      return { label: "Picked up (FA)", colour: "green" };
    case "release":
      return { label: "Released", colour: "red" };
    default:
      return { label: category, colour: "slate" };
  }
}

/** transfer_in / free_agent_pickup rows: player joined this club in this season. */
export function transferInsBySeason(rows: PlayerTransferTxRow[]): Map<string, TeamMini> {
  const m = new Map<string, TeamMini>();
  for (const r of rows) {
    if (r.category !== "transfer_in" && r.category !== "free_agent_pickup") continue;
    const t = Array.isArray(r.teams) ? r.teams[0] : r.teams;
    if (!t?.id) continue;
    m.set(r.season_label, { id: t.id, name: t.name, logo_url: t.logo_url });
  }
  return m;
}

/**
 * Each "release" in season R is logged on the club they left; attribute that club to the latest
 * stat season S with S < R (e.g. released at start of S2 → still shows club for S1 rows).
 */
function clubBySeasonFromReleases(
  statSeasons: string[],
  releaseRows: PlayerTransferTxRow[],
): Map<string, TeamMini> {
  const sortedAsc = [...new Set(statSeasons)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const out = new Map<string, TeamMini>();
  for (const r of releaseRows) {
    if (r.category !== "release") continue;
    const t = Array.isArray(r.teams) ? r.teams[0] : r.teams;
    if (!t?.id) continue;
    const R = r.season_label;
    let best: string | null = null;
    for (const s of sortedAsc) {
      if (s.localeCompare(R, undefined, { numeric: true }) < 0) best = s;
    }
    if (best && !out.has(best)) {
      out.set(best, { id: t.id, name: t.name, logo_url: t.logo_url });
    }
  }
  return out;
}

/** Forward-fill club across seasons (sorted ascending by label). */
export function seasonToClubMap(
  statSeasons: string[],
  insBySeason: Map<string, TeamMini>,
  currentSeason: string | null,
  currentTeam: TeamMini | null,
  releaseRows?: PlayerTransferTxRow[],
): Map<string, TeamMini | null> {
  const sorted = [...new Set(statSeasons)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  let last: TeamMini | null = null;
  const out = new Map<string, TeamMini | null>();
  for (const s of sorted) {
    const hit = insBySeason.get(s);
    if (hit) last = hit;
    out.set(s, last);
  }
  if (currentSeason && currentTeam) {
    const existing = out.get(currentSeason);
    if (!existing) out.set(currentSeason, currentTeam);
  }
  const fromRelease = releaseRows?.length
    ? clubBySeasonFromReleases(statSeasons, releaseRows)
    : new Map<string, TeamMini>();
  for (const [season, club] of fromRelease) {
    if (!out.get(season)) out.set(season, club);
  }
  return out;
}

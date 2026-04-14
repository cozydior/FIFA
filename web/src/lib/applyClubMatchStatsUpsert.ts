import type { SupabaseClient } from "@supabase/supabase-js";

/** One player’s contribution for a single domestic club match — drives `stats` upsert. */
export type MatchStatPlayer = {
  id: string;
  fotMob: number;
  goals?: number;
  saves?: number;
  shots?: number;
  shotsFaced?: number;
};

/**
 * Adds this match’s numbers into `stats` for the season (goals, saves, appearances,
 * average_rating, shots_taken, shots_faced). Same logic as `/api/matchday/complete`.
 */
export async function applyClubMatchStatsUpsert(
  supabase: SupabaseClient,
  season: string,
  players: MatchStatPlayer[],
): Promise<void> {
  const statPlayerIds = [
    ...new Set((players ?? []).map((x) => x.id).filter((id): id is string => Boolean(id))),
  ];
  const { data: rosterForStats, error: rosterErr } = await supabase
    .from("players")
    .select("id, team_id")
    .in("id", statPlayerIds);
  if (rosterErr) throw new Error(rosterErr.message);
  const teamIdForStat = new Map<string, string | null>(
    (rosterForStats ?? []).map((row) => [
      row.id as string,
      (row.team_id as string | null) ?? null,
    ]),
  );

  for (const p of players) {
    const matchGoals = typeof p.goals === "number" ? p.goals : 0;
    const matchSaves = typeof p.saves === "number" ? p.saves : 0;
    const fotMob = typeof p.fotMob === "number" ? p.fotMob : 0;

    const matchShots = typeof p.shots === "number" ? p.shots : 0;
    const matchShotsFaced = typeof p.shotsFaced === "number" ? p.shotsFaced : 0;

    const { data: existing, error: se } = await supabase
      .from("stats")
      .select("goals, saves, appearances, average_rating, shots_taken, shots_faced")
      .eq("player_id", p.id)
      .eq("season", season)
      .maybeSingle();

    if (se) throw new Error(se.message);

    const prevGoals = existing?.goals ?? 0;
    const prevSaves = existing?.saves ?? 0;
    const prevApps = existing?.appearances ?? 0;
    const newApps = prevApps + 1;
    const newGoals = prevGoals + matchGoals;
    const newSaves = prevSaves + matchSaves;
    const newShotsTaken = (existing?.shots_taken ?? 0) + matchShots;
    const newShotsFaced = (existing?.shots_faced ?? 0) + matchShotsFaced;

    let newAvg: number;
    if (prevApps <= 0 || existing?.average_rating == null) {
      newAvg = fotMob;
    } else {
      const prevAvg = Number(existing.average_rating);
      newAvg =
        Math.round(((prevAvg * prevApps + fotMob) / newApps) * 10) / 10;
    }

    const statTeamId = p.id ? teamIdForStat.get(p.id) ?? null : null;

    const { error: ie } = await supabase.from("stats").upsert(
      {
        player_id: p.id,
        season,
        goals: newGoals,
        saves: newSaves,
        appearances: newApps,
        average_rating: newAvg,
        shots_taken: newShotsTaken,
        shots_faced: newShotsFaced,
        team_id: statTeamId,
      },
      { onConflict: "player_id,season" },
    );

    if (ie) throw new Error(ie.message);
  }
}

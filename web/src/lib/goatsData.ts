import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type GoatWinner = {
  seasonLabel: string;
  awardType: "ballon_dor" | "palm_dor";
  playerId: string;
  playerName: string;
  role: string;
  profilePicUrl: string | null;
  team: { id: string; name: string; logoUrl: string | null } | null;
  goals: number;
  saves: number;
  shotsTaken: number;
  shotsFaced: number;
};

export type SeasonGoatPair = {
  seasonLabel: string;
  ballon: GoatWinner | null;
  palm: GoatWinner | null;
};

type PlayerEmbed = {
  id: string;
  name: string;
  role: string;
  profile_pic_url: string | null;
  team_id: string | null;
  teams:
    | { id: string; name: string; logo_url: string | null }
    | { id: string; name: string; logo_url: string | null }[]
    | null;
};

/**
 * Ballon d'Or (ST) & Palm d'Or (GK) winners by season, with that season's stats
 * and the player's current club (DB has no historical club snapshot per award).
 */
export async function fetchGoatHistory(): Promise<SeasonGoatPair[]> {
  const supabase = getSupabaseAdmin();
  const { data: awards, error } = await supabase
    .from("season_player_awards")
    .select("season_label, award_type, player_id")
    .order("season_label", { ascending: false });

  if (error) throw new Error(error.message);
  if (!awards?.length) return [];

  const playerIds = [...new Set(awards.map((a) => a.player_id))];
  const seasonLabels = [...new Set(awards.map((a) => a.season_label))];

  const [{ data: statsRows }, { data: playerRows }] = await Promise.all([
    supabase
      .from("stats")
      .select("player_id, season, goals, saves, shots_taken, shots_faced")
      .in("player_id", playerIds)
      .in("season", seasonLabels),
    supabase
      .from("players")
      .select("id, name, role, profile_pic_url, team_id, teams(id, name, logo_url)")
      .in("id", playerIds),
  ]);

  const statKey = (pid: string, s: string) => `${pid}::${s}`;
  const statMap = new Map(
    (statsRows ?? []).map((r) => [
      statKey(r.player_id, r.season),
      {
        goals: Number(r.goals ?? 0),
        saves: Number(r.saves ?? 0),
        shotsTaken: Number(r.shots_taken ?? 0),
        shotsFaced: Number(r.shots_faced ?? 0),
      },
    ]),
  );

  const playerById = new Map(
    (playerRows ?? []).map((p) => [p.id, p as PlayerEmbed]),
  );

  const bySeason = new Map<string, SeasonGoatPair>();

  for (const a of awards) {
    const p = playerById.get(a.player_id);
    if (!p?.id) continue;
    const rawTeam = p.teams;
    const t = Array.isArray(rawTeam) ? rawTeam[0] ?? null : rawTeam;
    const st = statMap.get(statKey(a.player_id, a.season_label));
    const winner: GoatWinner = {
      seasonLabel: a.season_label,
      awardType: a.award_type as "ballon_dor" | "palm_dor",
      playerId: p.id,
      playerName: p.name,
      role: p.role,
      profilePicUrl: p.profile_pic_url ?? null,
      team: t
        ? { id: t.id, name: t.name, logoUrl: t.logo_url ?? null }
        : null,
      goals: st?.goals ?? 0,
      saves: st?.saves ?? 0,
      shotsTaken: st?.shotsTaken ?? 0,
      shotsFaced: st?.shotsFaced ?? 0,
    };

    if (!bySeason.has(a.season_label)) {
      bySeason.set(a.season_label, {
        seasonLabel: a.season_label,
        ballon: null,
        palm: null,
      });
    }
    const row = bySeason.get(a.season_label)!;
    if (a.award_type === "ballon_dor") row.ballon = winner;
    else if (a.award_type === "palm_dor") row.palm = winner;
  }

  return [...bySeason.values()].sort((a, b) =>
    b.seasonLabel.localeCompare(a.seasonLabel),
  );
}

export type GoatTallyRow = {
  playerId: string;
  playerName: string;
  profilePicUrl: string | null;
  wins: number;
};

/**
 * Total wins per player across seasons (rows should be newest-first; first seen = latest name/avatar).
 */
export function buildGoatTallies(rows: SeasonGoatPair[]): {
  ballon: GoatTallyRow[];
  palm: GoatTallyRow[];
} {
  const ballonM = new Map<string, GoatTallyRow>();
  const palmM = new Map<string, GoatTallyRow>();

  for (const row of rows) {
    if (row.ballon) {
      const w = row.ballon;
      const cur = ballonM.get(w.playerId);
      if (!cur) {
        ballonM.set(w.playerId, {
          playerId: w.playerId,
          playerName: w.playerName,
          profilePicUrl: w.profilePicUrl,
          wins: 1,
        });
      } else {
        cur.wins += 1;
      }
    }
    if (row.palm) {
      const w = row.palm;
      const cur = palmM.get(w.playerId);
      if (!cur) {
        palmM.set(w.playerId, {
          playerId: w.playerId,
          playerName: w.playerName,
          profilePicUrl: w.profilePicUrl,
          wins: 1,
        });
      } else {
        cur.wins += 1;
      }
    }
  }

  const sortDesc = (a: GoatTallyRow, b: GoatTallyRow) =>
    b.wins - a.wins || a.playerName.localeCompare(b.playerName);

  return {
    ballon: [...ballonM.values()].sort(sortDesc),
    palm: [...palmM.values()].sort(sortDesc),
  };
}

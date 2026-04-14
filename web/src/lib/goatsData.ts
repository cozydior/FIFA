import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countryCodeToFlagEmoji, countryNameToFlagEmoji } from "@/lib/flags";

export type GoatWinner = {
  seasonLabel: string;
  awardType: "ballon_dor" | "palm_dor";
  playerId: string;
  playerName: string;
  role: string;
  profilePicUrl: string | null;
  /** Flag emoji from `countries` (or fallback) for `players.nationality`. */
  nationalityFlagEmoji: string | null;
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
  nationality: string;
  profile_pic_url: string | null;
  team_id: string | null;
  teams:
    | { id: string; name: string; logo_url: string | null }
    | { id: string; name: string; logo_url: string | null }[]
    | null;
};

/**
 * Ballon d'Or (ST) & Palm d'Or (GK) winners by season, with that season's stats
 * (league `stats` + summed `player_international_stats` across competitions)
 * and the club from `stats.team_id` for that award season when set (else current `players.team`).
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

  const [{ data: statsRows }, { data: playerRows }, intlBundle] = await Promise.all([
    supabase
      .from("stats")
      .select("player_id, season, goals, saves, shots_taken, shots_faced, team_id")
      .in("player_id", playerIds)
      .in("season", seasonLabels),
    supabase
      .from("players")
      .select("id, name, role, nationality, profile_pic_url, team_id, teams(id, name, logo_url)")
      .in("id", playerIds),
    supabase
      .from("player_international_stats")
      .select(
        "player_id, season_label, goals_for_country, saves_for_country, shots_taken, shots_faced",
      )
      .in("player_id", playerIds)
      .in("season_label", seasonLabels),
  ]);

  type IntlAgg = {
    player_id: string;
    season_label: string;
    goals_for_country?: number | null;
    saves_for_country?: number | null;
    shots_taken?: number | null;
    shots_faced?: number | null;
  };
  let intlRows: IntlAgg[] = intlBundle.error ? [] : ((intlBundle.data ?? []) as IntlAgg[]);
  if (intlBundle.error) {
    const fb = await supabase
      .from("player_international_stats")
      .select("player_id, season_label, goals_for_country, saves_for_country")
      .in("player_id", playerIds)
      .in("season_label", seasonLabels);
    intlRows = fb.error ? [] : ((fb.data ?? []) as IntlAgg[]);
  }

  const statKey = (pid: string, s: string) => `${pid}::${s}`;
  const statMap = new Map(
    (statsRows ?? []).map((r) => [
      statKey(r.player_id, r.season),
      {
        goals: Number(r.goals ?? 0),
        saves: Number(r.saves ?? 0),
        shotsTaken: Number(r.shots_taken ?? 0),
        shotsFaced: Number(r.shots_faced ?? 0),
        teamId: (r.team_id as string | null | undefined) ?? null,
      },
    ]),
  );

  const awardSeasonTeamIds = new Set<string>();
  for (const a of awards) {
    const row = statMap.get(statKey(a.player_id, a.season_label));
    if (row?.teamId) awardSeasonTeamIds.add(row.teamId);
  }

  const teamById = new Map<string, { id: string; name: string; logo_url: string | null }>();
  if (awardSeasonTeamIds.size > 0) {
    const { data: seasonTeams } = await supabase
      .from("teams")
      .select("id, name, logo_url")
      .in("id", [...awardSeasonTeamIds]);
    for (const tm of seasonTeams ?? []) {
      teamById.set(tm.id as string, tm as { id: string; name: string; logo_url: string | null });
    }
  }

  /** Sum international rows per player/season (NL + GC + WC, etc.). */
  const intlSumByKey = new Map<
    string,
    { goals: number; saves: number; shotsTaken: number; shotsFaced: number }
  >();
  for (const r of intlRows ?? []) {
    const row = r as {
      player_id: string;
      season_label: string;
      goals_for_country?: number | null;
      saves_for_country?: number | null;
      shots_taken?: number | null;
      shots_faced?: number | null;
    };
    const k = statKey(row.player_id, row.season_label);
    const cur = intlSumByKey.get(k) ?? {
      goals: 0,
      saves: 0,
      shotsTaken: 0,
      shotsFaced: 0,
    };
    cur.goals += Number(row.goals_for_country ?? 0);
    cur.saves += Number(row.saves_for_country ?? 0);
    cur.shotsTaken += Number(row.shots_taken ?? 0);
    cur.shotsFaced += Number(row.shots_faced ?? 0);
    intlSumByKey.set(k, cur);
  }

  const { data: countryRows } = await supabase
    .from("countries")
    .select("name, flag_emoji, code");

  const flagByNationalityLower = new Map<string, string>();
  for (const c of countryRows ?? []) {
    const raw = c.flag_emoji?.trim();
    const emoji =
      raw && raw !== "" ? raw : countryCodeToFlagEmoji(c.code);
    flagByNationalityLower.set((c.name ?? "").toLowerCase(), emoji);
  }

  function nationalityFlagEmoji(nat: string | null | undefined): string | null {
    const n = (nat ?? "").trim();
    if (!n) return null;
    const fromTable = flagByNationalityLower.get(n.toLowerCase());
    if (fromTable) return fromTable;
    const fb = countryNameToFlagEmoji(n);
    return fb === "🏳️" ? null : fb;
  }

  const playerById = new Map(
    (playerRows ?? []).map((p) => [p.id, p as PlayerEmbed]),
  );

  const bySeason = new Map<string, SeasonGoatPair>();

  for (const a of awards) {
    const p = playerById.get(a.player_id);
    if (!p?.id) continue;
    const rawTeam = p.teams;
    const t = Array.isArray(rawTeam) ? rawTeam[0] ?? null : rawTeam;
    const k = statKey(a.player_id, a.season_label);
    const st = statMap.get(k);
    const ig = intlSumByKey.get(k);
    const seasonTeamRow = st?.teamId ? teamById.get(st.teamId) : null;
    const teamFromSeason = seasonTeamRow
      ? {
          id: seasonTeamRow.id,
          name: seasonTeamRow.name,
          logoUrl: seasonTeamRow.logo_url ?? null,
        }
      : null;
    const teamFromPlayer = t
      ? { id: t.id, name: t.name, logoUrl: t.logo_url ?? null }
      : null;
    const winner: GoatWinner = {
      seasonLabel: a.season_label,
      awardType: a.award_type as "ballon_dor" | "palm_dor",
      playerId: p.id,
      playerName: p.name,
      role: p.role,
      profilePicUrl: p.profile_pic_url ?? null,
      nationalityFlagEmoji: nationalityFlagEmoji(p.nationality),
      team: teamFromSeason ?? teamFromPlayer,
      goals: (st?.goals ?? 0) + (ig?.goals ?? 0),
      saves: (st?.saves ?? 0) + (ig?.saves ?? 0),
      shotsTaken: (st?.shotsTaken ?? 0) + (ig?.shotsTaken ?? 0),
      shotsFaced: (st?.shotsFaced ?? 0) + (ig?.shotsFaced ?? 0),
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
  nationalityFlagEmoji?: string | null;
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
          nationalityFlagEmoji: w.nationalityFlagEmoji,
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
          nationalityFlagEmoji: w.nationalityFlagEmoji,
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

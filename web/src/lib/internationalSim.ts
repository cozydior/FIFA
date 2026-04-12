import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runMatch,
  type PlayerMatchResult,
  type ScoreBreakdown,
  type SimTeam,
} from "@/lib/simEngine";

type PRow = {
  id: string;
  name: string;
  role: string;
  rating: number;
  hidden_ovr: number | null;
};

function simOvr(p: { rating: number; hidden_ovr: number | null }): number {
  return p.hidden_ovr ?? p.rating;
}

/** Synthetic players for scoreline only — never written to DB stats */
const SYNTH = "nt-sim-synth:";

export function buildFallbackNationalSimTeam(nationalTeamId: string): SimTeam {
  const mid = 58;
  return {
    id: nationalTeamId,
    strikers: [
      { id: `${SYNTH}${nationalTeamId}:st1`, rating: mid, role: "ST" },
      { id: `${SYNTH}${nationalTeamId}:st2`, rating: mid - 2, role: "ST" },
    ],
    goalkeeper: { id: `${SYNTH}${nationalTeamId}:gk`, rating: mid, role: "GK" },
  };
}

export function isSyntheticInternationalPlayerId(id: string): boolean {
  return id.startsWith(SYNTH);
}

/**
 * Builds a SimTeam from season call-ups (2×ST + GK1), strikers ordered by OVR like club matchday.
 */
export async function buildSimTeamForNationalTeam(
  supabase: SupabaseClient,
  nationalTeamId: string,
  seasonLabel: string,
): Promise<SimTeam | null> {
  const { data: callups } = await supabase
    .from("national_team_callups")
    .select("slot, player_id")
    .eq("season_label", seasonLabel)
    .eq("national_team_id", nationalTeamId);

  const playerIds = [...new Set((callups ?? []).map((c) => c.player_id))];
  if (playerIds.length === 0) return null;

  const { data: players } = await supabase
    .from("players")
    .select("id, name, role, rating, hidden_ovr")
    .in("id", playerIds);

  const byId = new Map((players ?? []).map((p) => [p.id, p as PRow]));

  const gkCallup = (callups ?? []).find((c) => c.slot === "GK1");
  const stCallups = (callups ?? []).filter((c) => c.slot !== "GK1");

  const strikers = stCallups
    .map((c) => byId.get(c.player_id))
    .filter((p): p is PRow => p != null && p.role === "ST")
    .sort((a, b) => simOvr(b) - simOvr(a))
    .slice(0, 2);

  const gk = gkCallup ? byId.get(gkCallup.player_id) : undefined;

  if (strikers.length < 2 || !gk || gk.role !== "GK") return null;

  return {
    id: nationalTeamId,
    strikers: [
      {
        id: strikers[0]!.id,
        rating: simOvr(strikers[0]!),
        role: "ST",
        name: strikers[0]!.name,
      },
      {
        id: strikers[1]!.id,
        rating: simOvr(strikers[1]!),
        role: "ST",
        name: strikers[1]!.name,
      },
    ],
    goalkeeper: {
      id: gk.id,
      rating: simOvr(gk),
      role: "GK",
      name: gk.name,
    },
  };
}

export async function simulateNationalTeamFixture(
  supabase: SupabaseClient,
  homeNtId: string,
  awayNtId: string,
  seasonLabel: string,
  opts?: { knockout?: boolean },
): Promise<{
  homeScore: number;
  awayScore: number;
  /** FotMob + goals/saves for real players only */
  playerRows: PlayerMatchResult[];
  scoreBreakdown?: ScoreBreakdown;
}> {
  const [home, away] = await Promise.all([
    buildSimTeamForNationalTeam(supabase, homeNtId, seasonLabel),
    buildSimTeamForNationalTeam(supabase, awayNtId, seasonLabel),
  ]);

  const homeSim = home ?? buildFallbackNationalSimTeam(homeNtId);
  const awaySim = away ?? buildFallbackNationalSimTeam(awayNtId);

  const result = runMatch(homeSim, awaySim, { knockout: opts?.knockout });
  const playerRows = result.players.filter((p) => !isSyntheticInternationalPlayerId(p.id));

  return {
    homeScore: result.goalsByTeamId[homeNtId] ?? 0,
    awayScore: result.goalsByTeamId[awayNtId] ?? 0,
    playerRows,
    ...(result.scoreBreakdown ? { scoreBreakdown: result.scoreBreakdown } : {}),
  };
}

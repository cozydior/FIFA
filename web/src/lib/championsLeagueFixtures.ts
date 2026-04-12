import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAMPIONS_LEAGUE_WEEK_MIN } from "@/lib/calendarPhases";
import { buildChampionsLeagueSchedule } from "@/lib/universe/championsLeague";

/**
 * Inserts scheduled group-stage fixtures for the 6 CL qualifiers. Weeks start at {@link CHAMPIONS_LEAGUE_WEEK_MIN}.
 */
export async function insertChampionsLeagueGroupFixtures(
  supabase: SupabaseClient,
  seasonLabel: string,
  qualifierTeamIds: string[],
): Promise<{ inserted: number }> {
  if (qualifierTeamIds.length !== 6) {
    throw new Error("Champions League requires exactly 6 team IDs.");
  }
  const schedule = buildChampionsLeagueSchedule(qualifierTeamIds);
  const weekByMatchday = (md: number) => CHAMPIONS_LEAGUE_WEEK_MIN + md - 1;

  const rows = schedule.groupStageFixtures.map((fx, idx) => ({
    season_label: seasonLabel,
    competition: "champions_league" as const,
    league_id: null as string | null,
    country: null as string | null,
    home_team_id: fx.homeTeamId,
    away_team_id: fx.awayTeamId,
    week: weekByMatchday(fx.matchday),
    cup_round: `CL_G${fx.group}`,
    leg: 1,
    status: "scheduled" as const,
    sort_order: idx,
  }));

  const { error } = await supabase.from("fixtures").insert(rows);
  if (error) throw new Error(error.message);
  return { inserted: rows.length };
}

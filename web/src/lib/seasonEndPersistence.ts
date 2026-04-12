import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applySeasonLeaguePayouts } from "@/lib/seasonEconomy";
import {
  applySeasonEnd,
  championsLeagueQualifiedVia,
  type LeagueMeta,
  type LeagueStandingRow,
} from "@/lib/seasonStructure";

const CL_SLUG = "champions_league";
const CL_NAME = "Champions League";

/**
 * Applies promotion/relegation and CL qualification, then persists to Supabase.
 * Creates `seasons`, `tournaments`, `tournament_entries`, and updates `teams.league_id`.
 */
export async function persistSeasonEndToSupabase(params: {
  seasonLabel: string;
  standings: LeagueStandingRow[];
  leagues: LeagueMeta[];
  /** When false, skip league table + promotion prize money (CL qualification still runs). */
  applyLeaguePayouts?: boolean;
}): Promise<{
  seasonId: string;
  tournamentId: string;
  result: ReturnType<typeof applySeasonEnd>;
  leaguePayouts: { applied: boolean; notes: string[] };
}> {
  const {
    seasonLabel,
    standings,
    leagues,
    applyLeaguePayouts = true,
  } = params;
  const result = applySeasonEnd(standings, leagues);
  const supabase = getSupabaseAdmin();

  const { data: season, error: se } = await supabase
    .from("seasons")
    .upsert({ label: seasonLabel }, { onConflict: "label" })
    .select("id")
    .single();

  if (se || !season) {
    throw new Error(se?.message ?? "Failed to upsert season");
  }

  const { data: tournament, error: te } = await supabase
    .from("tournaments")
    .upsert(
      {
        slug: CL_SLUG,
        name: CL_NAME,
        season_id: season.id,
      },
      { onConflict: "slug,season_id" },
    )
    .select("id")
    .single();

  if (te || !tournament) {
    throw new Error(te?.message ?? "Failed to upsert tournament");
  }

  await supabase
    .from("tournament_entries")
    .delete()
    .eq("tournament_id", tournament.id);

  if (result.championsLeagueQualifiers.length > 0) {
    const rows = result.championsLeagueQualifiers.map((q) => ({
      tournament_id: tournament.id,
      team_id: q.teamId,
      qualified_via: championsLeagueQualifiedVia(q.country, q.position),
    }));
    const { error: ie } = await supabase.from("tournament_entries").insert(rows);
    if (ie) throw new Error(ie.message);
  }

  for (const u of result.teamLeagueUpdates) {
    const { error: ue } = await supabase
      .from("teams")
      .update({ league_id: u.newLeagueId })
      .eq("id", u.teamId);
    if (ue) throw new Error(ue.message);
  }

  let leaguePayouts = { applied: false, notes: [] as string[] };
  if (applyLeaguePayouts) {
    leaguePayouts = await applySeasonLeaguePayouts(
      supabase,
      seasonLabel,
      standings,
      leagues,
      result,
    );
  }

  return {
    seasonId: season.id,
    tournamentId: tournament.id,
    result,
    leaguePayouts,
  };
}

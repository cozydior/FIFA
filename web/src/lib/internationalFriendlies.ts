import type { SupabaseClient } from "@supabase/supabase-js";
import { WORLD_CUP_GROUP_WEEK_START } from "@/lib/calendarPhases";
import { fisherYatesShuffle } from "@/lib/shuffle";
import { resolveWorldCupQualifierNationalTeamIds } from "@/lib/federationWorldCupQual";

/** Four calendar weeks immediately before World Cup group weeks. */
export const FRIENDLY_WEEK_BASE = WORLD_CUP_GROUP_WEEK_START - 4;

/**
 * Creates / replaces the season's Friendlies competition: four fixtures among four national teams
 * that did not qualify for this season's World Cup, each team playing twice (two rounds).
 */
export async function generateInternationalFriendlies(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ competitionId: string; nationalTeamIds: string[] }> {
  const { data: allNt } = await supabase.from("national_teams").select("id").order("name");
  const allIds = (allNt ?? []).map((r) => r.id as string);
  if (allIds.length < 4) {
    throw new Error("Need at least four national teams in the database.");
  }

  const qualified = await resolveWorldCupQualifierNationalTeamIds(supabase, seasonLabel);
  const nonQual = allIds.filter((id) => !qualified.has(id));
  const pool = nonQual.length >= 4 ? nonQual : allIds;
  const picked = fisherYatesShuffle([...pool]).slice(0, 4);
  if (picked.length < 4) {
    throw new Error("Could not pick four teams for friendlies.");
  }
  const [t0, t1, t2, t3] = picked as [string, string, string, string];

  const { data: comp, error: ce } = await supabase
    .from("international_competitions")
    .upsert(
      { season_label: seasonLabel, slug: "friendlies", name: "Friendlies" },
      { onConflict: "season_label,slug" },
    )
    .select("id")
    .single();
  if (ce || !comp) throw new Error(ce?.message ?? "Friendlies competition upsert failed");

  await supabase.from("international_entries").delete().eq("competition_id", comp.id);
  await supabase.from("international_fixtures").delete().eq("competition_id", comp.id);

  const weeks = [FRIENDLY_WEEK_BASE, FRIENDLY_WEEK_BASE + 1, FRIENDLY_WEEK_BASE + 2, FRIENDLY_WEEK_BASE + 3];
  const rows = [
    {
      competition_id: comp.id,
      stage: "group",
      group_name: null,
      week: weeks[0]!,
      home_national_team_id: t0,
      away_national_team_id: t1,
      status: "scheduled",
    },
    {
      competition_id: comp.id,
      stage: "group",
      group_name: null,
      week: weeks[1]!,
      home_national_team_id: t2,
      away_national_team_id: t3,
      status: "scheduled",
    },
    {
      competition_id: comp.id,
      stage: "group",
      group_name: null,
      week: weeks[2]!,
      home_national_team_id: t0,
      away_national_team_id: t2,
      status: "scheduled",
    },
    {
      competition_id: comp.id,
      stage: "group",
      group_name: null,
      week: weeks[3]!,
      home_national_team_id: t1,
      away_national_team_id: t3,
      status: "scheduled",
    },
  ];
  const { error: fe } = await supabase.from("international_fixtures").insert(rows);
  if (fe) throw new Error(fe.message);

  return { competitionId: comp.id, nationalTeamIds: picked };
}

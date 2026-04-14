import type { SupabaseClient } from "@supabase/supabase-js";
import { fisherYatesShuffle } from "@/lib/shuffle";
import { WORLD_CUP_GROUP_WEEK_START } from "@/lib/calendarPhases";

/**
 * Ensures a `world_cup` competition row exists for the season (upsert only — does not clear entries or fixtures).
 */
export async function ensureWorldCupCompetitionRow(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<string> {
  const label = seasonLabel.trim();
  const { data: wc, error } = await supabase
    .from("international_competitions")
    .upsert(
      { season_label: label, slug: "world_cup", name: "FIFA World Cup" },
      { onConflict: "season_label,slug" },
    )
    .select("id")
    .single();
  if (error || !wc) throw new Error(error?.message ?? "World Cup competition upsert failed");
  return wc.id as string;
}

function roundRobin(ids: string[], startWeek: number): {
  home: string;
  away: string;
  week: number;
}[] {
  const out: { home: string; away: string; week: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push({ home: ids[i], away: ids[j], week: startWeek + out.length });
    }
  }
  return out;
}

/**
 * Inserts WC group fixtures: each group has 2 UEFA + 2 FIFA (4+4 total).
 * Deletes existing WC fixtures for this competition first.
 */
export async function insertBalancedWorldCupGroupFixtures(
  supabase: SupabaseClient,
  worldCupCompetitionId: string,
  nationalTeamIds: string[],
): Promise<void> {
  if (nationalTeamIds.length !== 8) {
    throw new Error("World Cup draw requires exactly 8 national teams.");
  }
  const { data: nts } = await supabase
    .from("national_teams")
    .select("id, confederation")
    .in("id", nationalTeamIds);
  const conf = new Map((nts ?? []).map((r) => [r.id, (r.confederation ?? "").toUpperCase()]));
  const uefa = nationalTeamIds.filter((id) => conf.get(id) === "UEFA");
  const fifa = nationalTeamIds.filter((id) => conf.get(id) === "FIFA");
  if (uefa.length !== 4 || fifa.length !== 4) {
    throw new Error(
      `Balanced World Cup groups need 4 UEFA and 4 FIFA qualifiers; got ${uefa.length} UEFA and ${fifa.length} FIFA.`,
    );
  }
  const uS = fisherYatesShuffle([...uefa]);
  const fS = fisherYatesShuffle([...fifa]);
  const groupA = [uS[0], uS[1], fS[0], fS[1]];
  const groupB = [uS[2], uS[3], fS[2], fS[3]];

  await supabase.from("international_fixtures").delete().eq("competition_id", worldCupCompetitionId);

  const rows = [
    ...roundRobin(groupA, WORLD_CUP_GROUP_WEEK_START).map((m) => ({ ...m, group: "A" as const })),
    ...roundRobin(groupB, WORLD_CUP_GROUP_WEEK_START).map((m) => ({ ...m, group: "B" as const })),
  ].map((m) => ({
    competition_id: worldCupCompetitionId,
    stage: "group",
    group_name: m.group,
    week: m.week,
    home_national_team_id: m.home,
    away_national_team_id: m.away,
    status: "scheduled",
  }));

  const { error } = await supabase.from("international_fixtures").insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * If eight WC qualifiers exist and no group fixtures yet, inserts balanced WC groups.
 */
export async function tryInsertWorldCupGroupStageIfReady(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ inserted: boolean }> {
  const season = seasonLabel.trim();
  let { data: wc } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", season)
    .eq("slug", "world_cup")
    .maybeSingle();
  if (!wc) {
    await ensureWorldCupCompetitionRow(supabase, season);
    ({ data: wc } = await supabase
      .from("international_competitions")
      .select("id")
      .eq("season_label", season)
      .eq("slug", "world_cup")
      .maybeSingle());
  }
  if (!wc) return { inserted: false };

  const { data: existingWcFixtures } = await supabase
    .from("international_fixtures")
    .select("id")
    .eq("competition_id", wc.id);
  if ((existingWcFixtures ?? []).length > 0) return { inserted: false };

  try {
    const { syncWorldCupInternationalEntriesFromResolution } = await import("@/lib/tournamentGates");
    await syncWorldCupInternationalEntriesFromResolution(supabase, season, wc.id);
  } catch (e) {
    console.warn("[tryInsertWorldCupGroupStageIfReady] qualifier sync skipped:", e);
  }

  const { data: wcEntries } = await supabase
    .from("international_entries")
    .select("national_team_id")
    .eq("competition_id", wc.id);
  const wcIds = [...new Set((wcEntries ?? []).map((e) => e.national_team_id))];
  if (wcIds.length !== 8) return { inserted: false };

  await insertBalancedWorldCupGroupFixtures(supabase, wc.id, wcIds);
  return { inserted: true };
}

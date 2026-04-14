import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeInternationalTable,
  fetchInternationalSavesByNationalTeam,
} from "@/lib/international";
import { getPreviousSeasonLabel, parseSeasonIndexFromLabel } from "@/lib/nextSeason";

/** @deprecated use parseSeasonIndexFromLabel */
export function parseSeasonNumberFromLabel(label: string): number | null {
  return parseSeasonIndexFromLabel(label);
}

async function computeRegionalQualifiersFromCompletedGroups(
  supabase: SupabaseClient,
  seasonLabel: string,
  slug: "nations_league" | "gold_cup",
): Promise<string[] | null> {
  const { data: comp } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("slug", slug)
    .maybeSingle();
  if (!comp) return null;

  const { data: fixtures } = await supabase
    .from("international_fixtures")
    .select(
      "stage, group_name, status, home_score, away_score, home_national_team_id, away_national_team_id",
    )
    .eq("competition_id", comp.id);

  const groupFx = (fixtures ?? []).filter((f) => f.stage === "group");
  if (groupFx.length === 0) return null;
  if (!groupFx.every((f) => f.status === "completed")) return null;

  const intlSaves = await fetchInternationalSavesByNationalTeam(supabase, seasonLabel, slug);
  const out: string[] = [];
  for (const g of ["A", "B"] as const) {
    const gf = groupFx.filter((f) => f.group_name === g);
    const ids = [...new Set(gf.flatMap((f) => [f.home_national_team_id, f.away_national_team_id]))];
    const table = computeInternationalTable(
      ids,
      gf.map((f) => ({
        home_national_team_id: f.home_national_team_id,
        away_national_team_id: f.away_national_team_id,
        home_score: f.home_score,
        away_score: f.away_score,
        status: f.status,
      })),
      { teamSaves: intlSaves },
    );
    const top2 = table.slice(0, 2).map((r) => r.teamId);
    if (top2.length !== 2) return null;
    out.push(...top2);
  }
  return out;
}

async function recomputeWorldCupQualifiersFromPriorRegionals(
  supabase: SupabaseClient,
  worldCupSeasonLabel: string,
): Promise<Set<string>> {
  const prev = await getPreviousSeasonLabel(supabase, worldCupSeasonLabel.trim());
  if (!prev) return new Set();
  const nl = await computeRegionalQualifiersFromCompletedGroups(supabase, prev, "nations_league");
  const gc = await computeRegionalQualifiersFromCompletedGroups(supabase, prev, "gold_cup");
  if (!nl || !gc) return new Set();
  return new Set([...nl, ...gc]);
}

/**
 * National team IDs that qualified for the World Cup in `worldCupSeasonLabel`.
 * If the prior season's Nations League + Gold Cup groups are complete, that full set of 8 wins over
 * partial/stale `international_entries` so federation Q/E and WC draw gates stay aligned.
 */
export async function resolveWorldCupQualifierNationalTeamIds(
  supabase: SupabaseClient,
  worldCupSeasonLabel: string,
): Promise<Set<string>> {
  const season = worldCupSeasonLabel.trim();
  const recomputed = await recomputeWorldCupQualifiersFromPriorRegionals(supabase, season);
  if (recomputed.size === 8) return recomputed;

  const { data: wc } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", season)
    .eq("slug", "world_cup")
    .maybeSingle();

  if (wc) {
    const { data: entries } = await supabase
      .from("international_entries")
      .select("national_team_id")
      .eq("competition_id", wc.id);
    const fromDb = [...new Set((entries ?? []).map((e) => e.national_team_id as string))];
    if (fromDb.length === 8) return new Set(fromDb);
    if (fromDb.length > 0) return new Set(fromDb);
  }

  return recomputed;
}

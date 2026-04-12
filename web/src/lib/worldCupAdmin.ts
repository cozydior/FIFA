import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeInternationalTable,
  fetchInternationalSavesByNationalTeam,
} from "@/lib/international";
import { insertBalancedWorldCupGroupFixtures } from "@/lib/worldCupFixtures";

/** Top two team IDs per group (A, B) after all group fixtures are completed. */
export async function fetchTopTwoPerGroupForRegional(
  supabase: SupabaseClient,
  seasonLabel: string,
  slug: "nations_league" | "gold_cup",
): Promise<{ A: string[]; B: string[] } | null> {
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
      "id, stage, group_name, week, status, home_score, away_score, home_national_team_id, away_national_team_id",
    )
    .eq("competition_id", comp.id)
    .order("week");

  const groupFixtures = (fixtures ?? []).filter((f) => f.stage === "group");
  const groupDone =
    groupFixtures.length > 0 && groupFixtures.every((f) => f.status === "completed");
  if (!groupDone) return null;

  const intlSaves = await fetchInternationalSavesByNationalTeam(supabase, seasonLabel, slug);
  const out: { A: string[]; B: string[] } = { A: [], B: [] };
  for (const g of ["A", "B"] as const) {
    const gf = groupFixtures.filter((f) => f.group_name === g);
    const ids = [...new Set(gf.flatMap((f) => [f.home_national_team_id, f.away_national_team_id]))];
    const table = computeInternationalTable(ids, gf as any, { teamSaves: intlSaves });
    out[g] = table.slice(0, 2).map((r) => r.teamId);
  }
  if (out.A.length !== 2 || out.B.length !== 2) return null;
  return out;
}

export async function collectWorldCupQualifiersFromRegionals(
  supabase: SupabaseClient,
  qualifierSeasonLabel: string,
): Promise<{ teamIds: string[]; detail: string }> {
  const nl = await fetchTopTwoPerGroupForRegional(supabase, qualifierSeasonLabel, "nations_league");
  const gc = await fetchTopTwoPerGroupForRegional(supabase, qualifierSeasonLabel, "gold_cup");
  if (!nl) {
    return { teamIds: [], detail: "Nations League group stage is not fully complete." };
  }
  if (!gc) {
    return { teamIds: [], detail: "Gold Cup group stage is not fully complete." };
  }
  const teamIds = [...nl.A, ...nl.B, ...gc.A, ...gc.B];
  const unique = [...new Set(teamIds)];
  if (unique.length !== 8) {
    return {
      teamIds: [],
      detail: `Expected 8 unique qualifiers, got ${unique.length} (overlap between tournaments?).`,
    };
  }
  return { teamIds: unique, detail: "ok" };
}

/**
 * Full reset: sets WC entries to the 8 qualifiers from the qualifier season, then draws balanced groups.
 */
export async function seedWorldCupFromQualifiers(
  supabase: SupabaseClient,
  worldCupSeasonLabel: string,
  qualifierSeasonLabel: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const collected = await collectWorldCupQualifiersFromRegionals(supabase, qualifierSeasonLabel);
  if (collected.teamIds.length !== 8) {
    return { ok: false, error: collected.detail };
  }

  const { data: wc, error: wce } = await supabase
    .from("international_competitions")
    .upsert(
      { season_label: worldCupSeasonLabel, slug: "world_cup", name: "FIFA World Cup" },
      { onConflict: "season_label,slug" },
    )
    .select("id")
    .single();
  if (wce || !wc) {
    return { ok: false, error: wce?.message ?? "World Cup competition upsert failed" };
  }

  await supabase.from("international_entries").delete().eq("competition_id", wc.id);
  await supabase.from("international_fixtures").delete().eq("competition_id", wc.id);

  const rows = collected.teamIds.map((national_team_id) => ({
    competition_id: wc.id,
    national_team_id,
    group_name: null as string | null,
  }));
  const { error: ie } = await supabase.from("international_entries").insert(rows);
  if (ie) return { ok: false, error: ie.message };

  try {
    await insertBalancedWorldCupGroupFixtures(supabase, wc.id, collected.teamIds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Draw failed" };
  }
  return { ok: true };
}

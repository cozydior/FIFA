import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveWorldCupQualifierNationalTeamIds } from "@/lib/federationWorldCupQual";
import { ensureWorldCupCompetitionRow } from "@/lib/worldCupFixtures";

/** Writes `international_entries` from regional recompute when it yields exactly 8 teams (fixes empty/partial rows). */
export async function syncWorldCupInternationalEntriesFromResolution(
  supabase: SupabaseClient,
  seasonLabel: string,
  wcCompetitionId: string,
): Promise<void> {
  const resolved = await resolveWorldCupQualifierNationalTeamIds(supabase, seasonLabel);
  if (resolved.size !== 8) return;

  const { data: existing } = await supabase
    .from("international_entries")
    .select("national_team_id")
    .eq("competition_id", wcCompetitionId);
  const ex = new Set((existing ?? []).map((r) => r.national_team_id as string));
  const same = ex.size === 8 && [...resolved].every((id) => ex.has(id));
  if (same) return;

  await supabase.from("international_entries").delete().eq("competition_id", wcCompetitionId);
  const { error } = await supabase.from("international_entries").insert(
    [...resolved].map((national_team_id) => ({
      competition_id: wcCompetitionId,
      national_team_id,
      group_name: null as string | null,
    })),
  );
  if (error) throw new Error(error.message);
}

async function scheduledCount(
  supabase: SupabaseClient,
  seasonLabel: string,
  filter: { competition?: string; competitionIn?: string[] },
): Promise<number> {
  let q = supabase
    .from("fixtures")
    .select("id", { count: "exact", head: true })
    .eq("season_label", seasonLabel)
    .eq("status", "scheduled");
  if (filter.competition) {
    q = q.eq("competition", filter.competition);
  } else if (filter.competitionIn?.length) {
    q = q.in("competition", filter.competitionIn);
  }
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function totalLeagueFixtures(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("fixtures")
    .select("id", { count: "exact", head: true })
    .eq("season_label", seasonLabel)
    .eq("competition", "league");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** All domestic league matches for the season have a result (none left scheduled). */
export async function allLeagueMatchesComplete(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<boolean> {
  const total = await totalLeagueFixtures(supabase, seasonLabel);
  if (total === 0) return false;
  const sched = await scheduledCount(supabase, seasonLabel, { competition: "league" });
  return sched === 0;
}

/** League + regional cups + Champions League (if any CL rows exist) all completed. */
export async function allDomesticAndClComplete(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<boolean> {
  const schedDomestic = await scheduledCount(supabase, seasonLabel, {
    competitionIn: ["league", "regional_cup"],
  });
  if (schedDomestic > 0) return false;

  const { count: clTotal } = await supabase
    .from("fixtures")
    .select("id", { count: "exact", head: true })
    .eq("season_label", seasonLabel)
    .eq("competition", "champions_league");
  if ((clTotal ?? 0) === 0) return true;

  const schedCl = await scheduledCount(supabase, seasonLabel, { competition: "champions_league" });
  return schedCl === 0;
}

export async function canSeedChampionsLeagueFixtures(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ ok: boolean; reason?: string }> {
  const ok = await allLeagueMatchesComplete(supabase, seasonLabel);
  if (!ok) {
    return {
      ok: false,
      reason: "Finish every regular league fixture for this season before starting Champions League.",
    };
  }
  return { ok: true };
}

export async function canBootstrapNationsLeagueOrGoldCup(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ ok: boolean; reason?: string }> {
  const ok = await allDomesticAndClComplete(supabase, seasonLabel);
  if (!ok) {
    return {
      ok: false,
      reason:
        "Complete all league games, regional cups, and Champions League matches for this season first.",
    };
  }
  return { ok: true };
}

export async function canDrawWorldCupGroups(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ ok: boolean; reason?: string }> {
  const season = seasonLabel.trim();
  let { data: wc } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", season)
    .eq("slug", "world_cup")
    .maybeSingle();
  if (!wc) {
    try {
      await ensureWorldCupCompetitionRow(supabase, season);
      ({ data: wc } = await supabase
        .from("international_competitions")
        .select("id")
        .eq("season_label", season)
        .eq("slug", "world_cup")
        .maybeSingle());
    } catch {
      return { ok: false, reason: "Could not create World Cup competition for this season." };
    }
  }
  if (!wc) {
    return { ok: false, reason: "World Cup competition row missing for this season." };
  }
  try {
    await syncWorldCupInternationalEntriesFromResolution(supabase, season, wc.id);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Could not sync World Cup qualifiers from regional tables.",
    };
  }
  const { count: ent } = await supabase
    .from("international_entries")
    .select("national_team_id", { count: "exact", head: true })
    .eq("competition_id", wc.id);
  if ((ent ?? 0) < 8) {
    const resolved = await resolveWorldCupQualifierNationalTeamIds(supabase, season);
    return {
      ok: false,
      reason: `Need eight World Cup qualifiers for this season (database has ${ent ?? 0}; resolved ${resolved.size} from prior season regional tables). Finish both Nations League and Gold Cup group stages for the prior season, or add entries in Admin.`,
    };
  }
  const { count: fx } = await supabase
    .from("international_fixtures")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", wc.id);
  if ((fx ?? 0) > 0) {
    return { ok: false, reason: "World Cup fixtures already exist for this season." };
  }
  return { ok: true };
}

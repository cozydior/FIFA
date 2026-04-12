import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INTERNATIONAL_CALENDAR_WEEK_MIN,
  WORLD_CUP_GROUP_WEEK_START,
} from "@/lib/calendarPhases";
import { fisherYatesShuffle } from "@/lib/shuffle";
import { computeStandings, type FixtureRow } from "@/lib/standings";

type NT = {
  id: string;
  name: string;
  flag_emoji: string | null;
  confederation: string;
};

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

async function loadShuffledNationalPools(supabase: SupabaseClient): Promise<{
  uefa: NT[];
  fifa: NT[];
}> {
  const { data: ntRows, error: ne } = await supabase
    .from("national_teams")
    .select("id, name, flag_emoji, confederation")
    .order("name");
  if (ne) throw new Error(ne.message);
  const nts = (ntRows ?? []) as NT[];
  const uefa = fisherYatesShuffle(nts.filter((n) => n.confederation === "UEFA"));
  const fifa = fisherYatesShuffle(nts.filter((n) => n.confederation === "FIFA"));
  if (uefa.length !== 6 || fifa.length !== 6) {
    throw new Error(
      `Need exactly 6 UEFA + 6 FIFA national teams. Found UEFA=${uefa.length}, FIFA=${fifa.length}.`,
    );
  }
  return { uefa, fifa };
}

/** Nations League or Gold Cup: groups + fixtures at calendar weeks ≥ {@link INTERNATIONAL_CALENDAR_WEEK_MIN}. */
export async function bootstrapRegionalInternationalCompetition(
  supabase: SupabaseClient,
  seasonLabel: string,
  slug: "nations_league" | "gold_cup",
  pool: NT[],
): Promise<void> {
  const name = slug === "nations_league" ? "UEFA Nations League" : "FIFA Gold Cup";
  const { data: comp, error: ce } = await supabase
    .from("international_competitions")
    .upsert(
      { season_label: seasonLabel, slug, name },
      { onConflict: "season_label,slug" },
    )
    .select("id")
    .single();
  if (ce || !comp) throw new Error(ce?.message ?? "Competition upsert failed");

  await supabase.from("international_entries").delete().eq("competition_id", comp.id);
  await supabase.from("international_fixtures").delete().eq("competition_id", comp.id);

  const entries = pool.map((t, idx) => ({
    competition_id: comp.id,
    national_team_id: t.id,
    group_name: idx < 3 ? "A" : "B",
    seed: idx + 1,
  }));
  const { error: ie } = await supabase.from("international_entries").insert(entries);
  if (ie) throw new Error(ie.message);

  const groupA = pool.slice(0, 3).map((t) => t.id);
  const groupB = pool.slice(3, 6).map((t) => t.id);
  const rrA = roundRobin(groupA, INTERNATIONAL_CALENDAR_WEEK_MIN).map((m) => ({ ...m, group: "A" }));
  const rrB = roundRobin(groupB, INTERNATIONAL_CALENDAR_WEEK_MIN).map((m) => ({ ...m, group: "B" }));
  const fixtureRows = [...rrA, ...rrB].map((m) => ({
    competition_id: comp.id,
    stage: "group",
    group_name: m.group,
    week: m.week,
    home_national_team_id: m.home,
    away_national_team_id: m.away,
    status: "scheduled",
  }));
  const { error: fe } = await supabase.from("international_fixtures").insert(fixtureRows);
  if (fe) throw new Error(fe.message);

  await supabase.from("international_competitions").upsert(
    { season_label: seasonLabel, slug: "world_cup", name: "FIFA World Cup" },
    { onConflict: "season_label,slug" },
  );
}

export async function ensureWorldCupShell(supabase: SupabaseClient, seasonLabel: string): Promise<void> {
  const { data: wc, error: we } = await supabase
    .from("international_competitions")
    .upsert(
      { season_label: seasonLabel, slug: "world_cup", name: "FIFA World Cup" },
      { onConflict: "season_label,slug" },
    )
    .select("id")
    .single();
  if (we || !wc) throw new Error(we?.message ?? "World Cup upsert failed");
  await supabase.from("international_entries").delete().eq("competition_id", wc.id);
  await supabase.from("international_fixtures").delete().eq("competition_id", wc.id);
}

/**
 * If eight WC qualifiers exist and no group fixtures yet, inserts WC groups (weeks from
 * {@link WORLD_CUP_GROUP_WEEK_START}). Used when qualifiers are present (e.g. after regional knockouts) or manual draw.
 */
export async function tryInsertWorldCupGroupStageIfReady(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ inserted: boolean }> {
  const { data: wc } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("slug", "world_cup")
    .maybeSingle();
  if (!wc) return { inserted: false };

  const { data: existingWcFixtures } = await supabase
    .from("international_fixtures")
    .select("id")
    .eq("competition_id", wc.id);
  if ((existingWcFixtures ?? []).length > 0) return { inserted: false };

  const { data: wcEntries } = await supabase
    .from("international_entries")
    .select("national_team_id")
    .eq("competition_id", wc.id);
  const wcIds = [...new Set((wcEntries ?? []).map((e) => e.national_team_id))];
  if (wcIds.length !== 8) return { inserted: false };

  const shuffled = fisherYatesShuffle(wcIds);
  const groupA = shuffled.slice(0, 4);
  const groupB = shuffled.slice(4, 8);
  const rows = [
    ...roundRobin(groupA, WORLD_CUP_GROUP_WEEK_START).map((m) => ({ ...m, group: "A" as const })),
    ...roundRobin(groupB, WORLD_CUP_GROUP_WEEK_START).map((m) => ({ ...m, group: "B" as const })),
  ].map((m) => ({
    competition_id: wc.id,
    stage: "group",
    group_name: m.group,
    week: m.week,
    home_national_team_id: m.home,
    away_national_team_id: m.away,
    status: "scheduled",
  }));
  if (rows.length === 0) return { inserted: false };
  const { error } = await supabase.from("international_fixtures").insert(rows);
  if (error) throw new Error(error.message);
  return { inserted: true };
}

/** Full bootstrap: both regional tournaments + empty World Cup shell (legacy Admin “generate all”). */
export async function bootstrapInternationalForSeason(
  supabase: SupabaseClient,
  seasonLabel: string,
): Promise<{ created: string[] }> {
  const { uefa, fifa } = await loadShuffledNationalPools(supabase);
  await bootstrapRegionalInternationalCompetition(supabase, seasonLabel, "nations_league", uefa);
  await bootstrapRegionalInternationalCompetition(supabase, seasonLabel, "gold_cup", fifa);
  await ensureWorldCupShell(supabase, seasonLabel);
  return { created: ["nations_league", "gold_cup", "world_cup"] };
}

/** One tournament at a time (gated at API). `world_cup` runs the WC group draw when 8 qualifiers exist. */
export async function bootstrapInternationalForSlug(
  supabase: SupabaseClient,
  seasonLabel: string,
  slug: "nations_league" | "gold_cup" | "world_cup",
): Promise<{ created: string[] }> {
  if (slug === "world_cup") {
    const { inserted } = await tryInsertWorldCupGroupStageIfReady(supabase, seasonLabel);
    return { created: inserted ? ["world_cup"] : [] };
  }
  const { uefa, fifa } = await loadShuffledNationalPools(supabase);
  if (slug === "nations_league") {
    await bootstrapRegionalInternationalCompetition(supabase, seasonLabel, "nations_league", uefa);
    return { created: ["nations_league"] };
  }
  await bootstrapRegionalInternationalCompetition(supabase, seasonLabel, "gold_cup", fifa);
  return { created: ["gold_cup"] };
}

/** Deterministic “penalties” when knockout scores are level (no home bias). */
export function tiebreakInternationalKnockout(
  homeNationalTeamId: string,
  awayNationalTeamId: string,
  fixtureId: string,
): string {
  let h = 0;
  const s = `${homeNationalTeamId}|${awayNationalTeamId}|${fixtureId}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? homeNationalTeamId : awayNationalTeamId;
}

function winnerOfKnockoutFixture(
  m: {
    id: string;
    home_national_team_id: string;
    away_national_team_id: string;
    home_score: number | null;
    away_score: number | null;
  },
): string {
  const hs = m.home_score ?? 0;
  const as = m.away_score ?? 0;
  if (hs > as) return m.home_national_team_id;
  if (as > hs) return m.away_national_team_id;
  return tiebreakInternationalKnockout(
    m.home_national_team_id,
    m.away_national_team_id,
    m.id,
  );
}

export function computeInternationalTable(
  teamIds: string[],
  fixtures: {
    home_national_team_id: string;
    away_national_team_id: string;
    home_score: number | null;
    away_score: number | null;
    status: string;
  }[],
) {
  const mapped: FixtureRow[] = fixtures.map((f) => ({
    league_id: null,
    home_team_id: f.home_national_team_id,
    away_team_id: f.away_national_team_id,
    home_score: f.home_score,
    away_score: f.away_score,
    status: f.status,
  }));
  const rows = computeStandings(teamIds, mapped, { mode: "tournament" });
  return rows.map((r) => ({
    teamId: r.teamId,
    played: r.played,
    points: r.points,
    gd: r.goalsFor - r.goalsAgainst,
    gf: r.goalsFor,
  }));
}

/**
 * Advances international knockouts when stages complete.
 *
 * **Regional (Nations League / Gold Cup):** when every group fixture is played, takes **top 2** per group from
 * standings, creates semis (A1 vs B2, B1 vs A2), and registers WC qualifiers. **World Cup:** when eight distinct
 * national teams are queued, shuffles them **without bias** into two groups of four and schedules group round-robins.
 */
export async function progressInternationalCompetition(
  supabase: SupabaseClient,
  seasonLabel: string,
  slug: "nations_league" | "gold_cup" | "world_cup",
): Promise<void> {
  const { data: comp } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("slug", slug)
    .maybeSingle();
  if (!comp) return;

  const { data: fixtures } = await supabase
    .from("international_fixtures")
    .select("id, stage, group_name, week, status, home_score, away_score, home_national_team_id, away_national_team_id")
    .eq("competition_id", comp.id)
    .order("week");
  const all = fixtures ?? [];

  const groupFixtures = all.filter((f) => f.stage === "group");
  const groupDone =
    groupFixtures.length > 0 && groupFixtures.every((f) => f.status === "completed");
  const hasSf = all.some((f) => f.stage === "SF");
  const hasFinal = all.some((f) => f.stage === "F");

  if (groupDone && !hasSf) {
    const groups = ["A", "B"] as const;
    const winners: Record<string, string[]> = {};
    for (const g of groups) {
      const gf = groupFixtures.filter((f) => f.group_name === g);
      const ids = [...new Set(gf.flatMap((f) => [f.home_national_team_id, f.away_national_team_id]))];
      const table = computeInternationalTable(ids, gf as any);
      winners[g] = table.slice(0, 2).map((r) => r.teamId);
    }
    if (winners.A?.length === 2 && winners.B?.length === 2) {
      const nextWeek = Math.max(...groupFixtures.map((f) => f.week), 0) + 1;
      await supabase.from("international_fixtures").insert([
        {
          competition_id: comp.id,
          stage: "SF",
          group_name: null,
          week: nextWeek,
          home_national_team_id: winners.A[0],
          away_national_team_id: winners.B[1],
          status: "scheduled",
        },
        {
          competition_id: comp.id,
          stage: "SF",
          group_name: null,
          week: nextWeek,
          home_national_team_id: winners.B[0],
          away_national_team_id: winners.A[1],
          status: "scheduled",
        },
      ]);
      if (slug !== "world_cup") {
        await ensureWorldCupEntriesFromRegional(supabase, seasonLabel, slug, winners.A, winners.B);
      }
    }
  }

  const { data: afterSf } = await supabase
    .from("international_fixtures")
    .select("id, stage, week, status, home_score, away_score, home_national_team_id, away_national_team_id")
    .eq("competition_id", comp.id)
    .eq("stage", "SF")
    .order("week");
  const sf = afterSf ?? [];
  if (sf.length === 2 && sf.every((m) => m.status === "completed") && !hasFinal) {
    const winners = sf.map((m) => winnerOfKnockoutFixture(m));
    const nextWeek = Math.max(...sf.map((f) => f.week), 0) + 1;
    await supabase.from("international_fixtures").insert({
      competition_id: comp.id,
      stage: "F",
      group_name: null,
      week: nextWeek,
      home_national_team_id: winners[0],
      away_national_team_id: winners[1],
      status: "scheduled",
    });
  }
}

async function ensureWorldCupEntriesFromRegional(
  supabase: SupabaseClient,
  seasonLabel: string,
  regionalSlug: string,
  topA: string[],
  topB: string[],
) {
  const { data: wc } = await supabase
    .from("international_competitions")
    .select("id")
    .eq("season_label", seasonLabel)
    .eq("slug", "world_cup")
    .maybeSingle();
  if (!wc) return;
  const qualifiers = [
    { id: topA[0], via: `${regionalSlug} A1` },
    { id: topA[1], via: `${regionalSlug} A2` },
    { id: topB[0], via: `${regionalSlug} B1` },
    { id: topB[1], via: `${regionalSlug} B2` },
  ];
  for (const q of qualifiers) {
    await supabase
      .from("international_entries")
      .upsert(
        {
          competition_id: wc.id,
          national_team_id: q.id,
          group_name: null,
        },
        { onConflict: "competition_id,national_team_id" },
      );
  }

  await tryInsertWorldCupGroupStageIfReady(supabase, seasonLabel);
}


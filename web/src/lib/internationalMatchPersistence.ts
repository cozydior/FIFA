import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerMatchResult } from "@/lib/simEngine";
import { progressInternationalCompetition } from "@/lib/international";

const SLUGS = ["nations_league", "gold_cup", "world_cup", "friendlies"] as const;
type IntlSlug = (typeof SLUGS)[number];

function isIntlSlug(s: string): s is IntlSlug {
  return (SLUGS as readonly string[]).includes(s);
}

/**
 * After a manual Matchday international game: update fixture, stats, MV, then advance knockouts.
 */
export async function persistInternationalMatchdayResult(
  supabase: SupabaseClient,
  args: {
    internationalFixtureId: string;
    homeNationalTeamId: string;
    awayNationalTeamId: string;
    homeScore: number;
    awayScore: number;
    players: PlayerMatchResult[];
    /** Knockout score line from sim (AET display). */
    scoreDetail?: Record<string, unknown>;
  },
): Promise<{ seasonLabel: string; slug: IntlSlug }> {
  const { data: row, error: fe } = await supabase
    .from("international_fixtures")
    .select("id, status, competition_id, home_national_team_id, away_national_team_id")
    .eq("id", args.internationalFixtureId)
    .single();

  if (fe || !row) throw new Error(fe?.message ?? "International fixture not found");

  const { data: compRow, error: ce } = await supabase
    .from("international_competitions")
    .select("season_label, slug")
    .eq("id", row.competition_id)
    .single();
  if (ce || !compRow) throw new Error(ce?.message ?? "Competition not found");

  const seasonLabel = compRow.season_label;
  const slugRaw = compRow.slug;
  if (!isIntlSlug(slugRaw)) {
    throw new Error("Invalid competition slug");
  }
  const slug = slugRaw;

  if (row.status !== "scheduled") {
    throw new Error("Fixture is not scheduled");
  }
  if (
    row.home_national_team_id !== args.homeNationalTeamId ||
    row.away_national_team_id !== args.awayNationalTeamId
  ) {
    throw new Error("National teams do not match this fixture");
  }

  const { error: ue } = await supabase
    .from("international_fixtures")
    .update({
      home_score: args.homeScore,
      away_score: args.awayScore,
      status: "completed",
      ...(args.scoreDetail ? { score_detail: args.scoreDetail } : {}),
    })
    .eq("id", args.internationalFixtureId);
  if (ue) throw new Error(ue.message);

  const mvMultiplier =
    slug === "world_cup" ? 1.8
    : slug === "nations_league" ? 1.35
    : slug === "friendlies" ? 1.05
    : 1.2;

  for (const p of args.players) {
    const fotMob = p.fotMob;
    const goals = p.goals ?? 0;
    const saves = p.saves ?? 0;
    const shotT = p.shots ?? 0;
    const shotF = p.shotsFaced ?? 0;

    const { data: existing } = await supabase
      .from("player_international_stats")
      .select(
        "caps, goals_for_country, saves_for_country, average_rating, shots_taken, shots_faced",
      )
      .eq("player_id", p.id)
      .eq("season_label", seasonLabel)
      .eq("competition_slug", slug)
      .maybeSingle();
    const prevCaps = existing?.caps ?? 0;
    const newCaps = prevCaps + 1;
    const prevAvg = existing?.average_rating == null ? null : Number(existing.average_rating);
    const avg =
      prevAvg == null
        ? fotMob
        : Math.round(((prevAvg * prevCaps + fotMob) / newCaps) * 10) / 10;
    const { error: ie } = await supabase.from("player_international_stats").upsert(
      {
        player_id: p.id,
        season_label: seasonLabel,
        competition_slug: slug,
        caps: newCaps,
        goals_for_country: (existing?.goals_for_country ?? 0) + goals,
        saves_for_country: (existing?.saves_for_country ?? 0) + saves,
        shots_taken: (existing?.shots_taken ?? 0) + shotT,
        shots_faced: (existing?.shots_faced ?? 0) + shotF,
        average_rating: avg,
      },
      { onConflict: "player_id,season_label,competition_slug" },
    );
    if (ie) throw new Error(ie.message);

    const { data: pl } = await supabase
      .from("players")
      .select("market_value, peak_market_value")
      .eq("id", p.id)
      .maybeSingle();
    const mv = Number(pl?.market_value ?? 0);
    const perfDelta =
      (goals * 0.06 + saves * 0.02 + (fotMob - 6) * 0.012) * mv * mvMultiplier;
    const nextMv = Math.max(0, Math.round(mv + perfDelta));
    await supabase
      .from("players")
      .update({
        market_value: nextMv,
        market_value_previous: mv,
        peak_market_value: Math.max(Number(pl?.peak_market_value ?? 0), nextMv),
      })
      .eq("id", p.id);
  }

  if (slug !== "friendlies") {
    await progressInternationalCompetition(supabase, seasonLabel, slug);
  }

  return { seasonLabel, slug };
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { progressInternationalCompetition } from "@/lib/international";
import { simulateNationalTeamFixture } from "@/lib/internationalSim";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { slug?: string; seasonLabel?: string };
    const seasonLabel =
      body.seasonLabel?.trim() || (await getCurrentSeasonLabel());
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "No season selected. Create/set a current season in Admin." },
        { status: 400 },
      );
    }
    if (!body.slug?.trim()) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }
    const slug = body.slug.trim();
    const supabase = getSupabaseAdmin();
    const { data: comp } = await supabase
      .from("international_competitions")
      .select("id")
      .eq("season_label", seasonLabel)
      .eq("slug", slug)
      .maybeSingle();
    if (!comp) return NextResponse.json({ error: "Competition not found" }, { status: 404 });

    const { data: fixtures } = await supabase
      .from("international_fixtures")
      .select("id, home_national_team_id, away_national_team_id, stage")
      .eq("competition_id", comp.id)
      .eq("status", "scheduled")
      .order("week");
    let completed = 0;

    const mvMultiplier =
      slug === "world_cup" ? 1.8 : slug === "nations_league" ? 1.35 : 1.2;

    for (const f of fixtures ?? []) {
      const knockout = f.stage !== "group";
      const { homeScore: hs, awayScore: as, playerRows, scoreBreakdown } =
        await simulateNationalTeamFixture(
          supabase,
          f.home_national_team_id,
          f.away_national_team_id,
          seasonLabel,
          { knockout },
        );

      const scoreDetail =
        scoreBreakdown ?
          {
            displayLine: scoreBreakdown.displayLine,
            regulationHome: scoreBreakdown.regulationHome,
            regulationAway: scoreBreakdown.regulationAway,
            finalHome: scoreBreakdown.finalHome,
            finalAway: scoreBreakdown.finalAway,
            etPeriodsPlayed: scoreBreakdown.etPeriodsPlayed,
            suddenDeath: scoreBreakdown.suddenDeath,
          }
        : null;

      const { error } = await supabase
        .from("international_fixtures")
        .update({
          home_score: hs,
          away_score: as,
          status: "completed",
          ...(scoreDetail ? { score_detail: scoreDetail } : {}),
        })
        .eq("id", f.id);
      if (error) throw new Error(error.message);

      for (const p of playerRows) {
        const fotMob = p.fotMob;
        const goals = p.goals ?? 0;
        const saves = p.saves ?? 0;

        const { data: existing } = await supabase
          .from("player_international_stats")
          .select("caps, goals_for_country, saves_for_country, average_rating")
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

      completed += 1;
    }
    await progressInternationalCompetition(
      supabase,
      seasonLabel,
      slug as "nations_league" | "gold_cup" | "world_cup",
    );
    return NextResponse.json({ ok: true, completed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sim failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

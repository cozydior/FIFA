import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { persistInternationalMatchdayResult } from "@/lib/internationalMatchPersistence";
import {
  progressChampionsLeagueKnockouts,
  progressRegionalCupKnockouts,
} from "@/lib/regionalCupProgress";
import { applyClubMatchStatsUpsert } from "@/lib/applyClubMatchStatsUpsert";
import { upsertPlayerMarketValueHistoryRow } from "@/lib/economyServer";
import type { PlayerMatchResult, ScoreBreakdown } from "@/lib/simEngine";

type BodyPlayer = {
  id: string;
  /** Hidden OVR after the match (alias: ratingAfter) */
  hiddenOvrAfter?: number;
  ratingAfter?: number;
  fotMob: number;
  goals?: number;
  saves?: number;
  shots?: number;
  shotsFaced?: number;
};

type SavedMatchSnapshot = {
  shots: unknown[];
  scoreBreakdown?: ScoreBreakdown;
  lineups: {
    home: { id: string; name: string; logoUrl: string | null; players: unknown[] };
    away: { id: string; name: string; logoUrl: string | null; players: unknown[] };
  };
  playerResults?: { id: string; fotMob: number; goals?: number; saves?: number }[];
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      seasonLabel,
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
      fixtureId,
      players,
      savedMatchSnapshot,
      internationalFixtureId,
      matchKind,
      fullPlayerResults,
      scoreBreakdown,
    } = body as {
      seasonLabel?: string;
      homeTeamId?: string;
      awayTeamId?: string;
      homeScore?: number;
      awayScore?: number;
      fixtureId?: string | null;
      players?: BodyPlayer[];
      savedMatchSnapshot?: SavedMatchSnapshot;
      internationalFixtureId?: string | null;
      matchKind?: string;
      fullPlayerResults?: PlayerMatchResult[];
      scoreBreakdown?: ScoreBreakdown;
    };

    if (!homeTeamId || !awayTeamId) {
      return NextResponse.json(
        { error: "homeTeamId and awayTeamId required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(players) || players.length === 0) {
      return NextResponse.json({ error: "players array required" }, { status: 400 });
    }
    if (typeof homeScore !== "number" || typeof awayScore !== "number") {
      return NextResponse.json({ error: "homeScore and awayScore required" }, { status: 400 });
    }

    const season =
      typeof seasonLabel === "string" && seasonLabel.trim()
        ? seasonLabel.trim()
        : await getCurrentSeasonLabel();
    if (!season) {
      return NextResponse.json(
        { error: "No season selected. Create/set a current season in Admin." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    if (matchKind === "international" && internationalFixtureId?.trim()) {
      const pr = Array.isArray(fullPlayerResults) ? fullPlayerResults : [];
      if (pr.length === 0) {
        return NextResponse.json(
          { error: "fullPlayerResults required for international matches" },
          { status: 400 },
        );
      }
      await persistInternationalMatchdayResult(supabase, {
        internationalFixtureId: internationalFixtureId.trim(),
        homeNationalTeamId: homeTeamId,
        awayNationalTeamId: awayTeamId,
        homeScore,
        awayScore,
        players: pr,
        scoreDetail:
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
          : undefined,
      });
      return NextResponse.json({ ok: true, season, savedMatchId: null });
    }

    let resolvedFixtureId =
      typeof fixtureId === "string" && fixtureId.trim() ? fixtureId.trim() : null;

    if (!resolvedFixtureId) {
      const { data: candidates } = await supabase
        .from("fixtures")
        .select("id, home_team_id, away_team_id, week")
        .eq("season_label", season)
        .eq("status", "scheduled");

      const pair = (candidates ?? []).filter(
        (c) =>
          (c.home_team_id === homeTeamId && c.away_team_id === awayTeamId) ||
          (c.home_team_id === awayTeamId && c.away_team_id === homeTeamId),
      );
      pair.sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
      resolvedFixtureId = pair[0]?.id ?? null;
    }

    if (resolvedFixtureId) {
      const { data: fxCanonical } = await supabase
        .from("fixtures")
        .select("id, home_team_id, away_team_id")
        .eq("id", resolvedFixtureId)
        .single();

      let dbHome = homeScore;
      let dbAway = awayScore;
      if (
        fxCanonical &&
        fxCanonical.home_team_id === awayTeamId &&
        fxCanonical.away_team_id === homeTeamId
      ) {
        dbHome = awayScore;
        dbAway = homeScore;
      }

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

      const { error: fe } = await supabase
        .from("fixtures")
        .update({
          home_score: dbHome,
          away_score: dbAway,
          status: "completed",
          ...(scoreDetail ? { score_detail: scoreDetail } : {}),
        })
        .eq("id", resolvedFixtureId);
      if (fe) throw new Error(fe.message);

    }

    for (const p of players) {
      const ovr =
        typeof p.hiddenOvrAfter === "number"
          ? p.hiddenOvrAfter
          : typeof p.ratingAfter === "number"
            ? p.ratingAfter
            : NaN;
      if (!p.id || Number.isNaN(ovr)) continue;
      const r = Math.round(ovr);
      const { error: ue } = await supabase
        .from("players")
        .update({ hidden_ovr: r, rating: r })
        .eq("id", p.id);
      if (ue) throw new Error(ue.message);

      const { data: pl, error: pe } = await supabase
        .from("players")
        .select("market_value, peak_market_value")
        .eq("id", p.id)
        .single();
      if (pe) throw new Error(pe.message);
      const mv = Number(pl?.market_value ?? 0);
      const prevPeak = Number(pl?.peak_market_value ?? 0);
      const peak = Math.max(prevPeak, mv);
      if (peak > prevPeak) {
        const { error: pk } = await supabase
          .from("players")
          .update({ peak_market_value: peak })
          .eq("id", p.id);
        if (pk) throw new Error(pk.message);
      }

      // Domestic form-driven MV progression (last-5 proxy from current performance).
      const perfWeight = p.goals ? p.goals * 0.05 : p.saves ? p.saves * 0.02 : 0;
      const ratingWeight = ((typeof p.fotMob === "number" ? p.fotMob : 6) - 6) * 0.012;
      const delta = (perfWeight + ratingWeight) * mv;
      let finalMv = mv;
      if (delta !== 0) {
        const nextMv = Math.max(0, Math.round(mv + delta));
        finalMv = nextMv;
        const { error: me } = await supabase
          .from("players")
          .update({
            market_value: nextMv,
            market_value_previous: mv,
            peak_market_value: Math.max(peak, nextMv),
          })
          .eq("id", p.id);
        if (me) throw new Error(me.message);
      }

      await upsertPlayerMarketValueHistoryRow(supabase, p.id, season, finalMv);
    }

    await applyClubMatchStatsUpsert(supabase, season, players);

    let savedMatchId: string | null = null;
    const snap = savedMatchSnapshot;
    if (
      snap &&
      Array.isArray(snap.shots) &&
      snap.shots.length > 0 &&
      snap.lineups?.home?.id &&
      snap.lineups?.away?.id
    ) {
      try {
        const { data: inserted, error: saveErr } = await supabase
          .from("saved_sim_matches")
          .insert({
            season_label: season,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            home_score: homeScore,
            away_score: awayScore,
            fixture_id: resolvedFixtureId,
            shots: snap.shots,
            lineups: snap.lineups,
            player_results: snap.playerResults ?? [],
            score_breakdown: snap.scoreBreakdown ?? null,
          })
          .select("id")
          .single();
        if (!saveErr && inserted?.id) {
          savedMatchId = inserted.id as string;
        }
      } catch {
        /* table may not exist until migration applied */
      }
    }

    try {
      await progressRegionalCupKnockouts(supabase, season);
      await progressChampionsLeagueKnockouts(supabase, season);
    } catch {
      /* optional — never fail save if bracket insert fails */
    }

    return NextResponse.json({ ok: true, season, savedMatchId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Persist failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

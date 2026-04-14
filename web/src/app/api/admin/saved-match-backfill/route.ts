import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import {
  buildSyntheticShots,
  pickClubLineup,
  splitFixtureScore,
  type DbPlayerRow,
} from "@/lib/savedMatchBackfill";
import { flagEmojiByNationalityNames } from "@/lib/nationalityFlags";

type Body = {
  fixtureId?: string;
  homeScorerIds?: string[];
  awayScorerIds?: string[];
  /** Optional FotMob 0–10 per player id in the six lineup slots */
  fotMobByPlayerId?: Record<string, number>;
};

function aggregateStatsFromShots(
  shots: { strikerId: string; goalkeeperId: string; goal: boolean }[],
): {
  goals: Map<string, number>;
  shotsByStriker: Map<string, number>;
  savesByGk: Map<string, number>;
  facedByGk: Map<string, number>;
} {
  const goals = new Map<string, number>();
  const shotsByStriker = new Map<string, number>();
  const savesByGk = new Map<string, number>();
  const facedByGk = new Map<string, number>();

  for (const s of shots) {
    shotsByStriker.set(s.strikerId, (shotsByStriker.get(s.strikerId) ?? 0) + 1);
    facedByGk.set(s.goalkeeperId, (facedByGk.get(s.goalkeeperId) ?? 0) + 1);
    if (s.goal) {
      goals.set(s.strikerId, (goals.get(s.strikerId) ?? 0) + 1);
    } else {
      savesByGk.set(s.goalkeeperId, (savesByGk.get(s.goalkeeperId) ?? 0) + 1);
    }
  }

  return { goals, shotsByStriker, savesByGk, facedByGk };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fixtureId = searchParams.get("fixtureId");
    const seasonParam = searchParams.get("seasonLabel");

    const supabase = getSupabaseAdmin();
    const season =
      typeof seasonParam === "string" && seasonParam.trim() ?
        seasonParam.trim()
      : await getCurrentSeasonLabel();

    if (!season) {
      return NextResponse.json(
        { error: "No season label (pass seasonLabel or set current season)." },
        { status: 400 },
      );
    }

    if (!fixtureId?.trim()) {
      const { data: savedRows, error: se } = await supabase
        .from("saved_sim_matches")
        .select("fixture_id")
        .eq("season_label", season)
        .not("fixture_id", "is", null);
      if (se) throw new Error(se.message);
      const savedFixtureIds = new Set(
        (savedRows ?? []).map((r) => r.fixture_id as string).filter(Boolean),
      );

      const { data: fixtures, error: fe } = await supabase
        .from("fixtures")
        .select(
          "id, season_label, week, competition, cup_round, home_team_id, away_team_id, home_score, away_score, status",
        )
        .eq("season_label", season)
        .eq("status", "completed")
        .order("week", { ascending: true });

      if (fe) throw new Error(fe.message);

      const missing = (fixtures ?? []).filter(
        (f) =>
          typeof f.home_score === "number" &&
          typeof f.away_score === "number" &&
          !savedFixtureIds.has(f.id as string),
      );

      if (missing.length === 0) {
        return NextResponse.json({ seasonLabel: season, fixtures: [] });
      }

      const teamIds = [...new Set(missing.flatMap((f) => [f.home_team_id, f.away_team_id]))];
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, logo_url")
        .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);

      const teamById = new Map((teams ?? []).map((t) => [t.id as string, t]));

      return NextResponse.json({
        seasonLabel: season,
        fixtures: missing.map((f) => {
          const h = teamById.get(f.home_team_id as string);
          const a = teamById.get(f.away_team_id as string);
          return {
            id: f.id,
            week: f.week,
            competition: f.competition,
            cup_round: f.cup_round,
            home_team_id: f.home_team_id,
            away_team_id: f.away_team_id,
            home_team_name: h?.name ?? "?",
            away_team_name: a?.name ?? "?",
            home_score: f.home_score,
            away_score: f.away_score,
          };
        }),
      });
    }

    const { data: fx, error: fxe } = await supabase
      .from("fixtures")
      .select(
        "id, season_label, week, competition, cup_round, home_team_id, away_team_id, home_score, away_score, score_detail, status",
      )
      .eq("id", fixtureId.trim())
      .maybeSingle();

    if (fxe || !fx) {
      return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
    }
    if (fx.status !== "completed") {
      return NextResponse.json(
        { error: "Fixture is not completed — nothing to backfill." },
        { status: 400 },
      );
    }
    if (typeof fx.home_score !== "number" || typeof fx.away_score !== "number") {
      return NextResponse.json(
        { error: "Fixture is missing scores in the database." },
        { status: 400 },
      );
    }

    const { data: existing } = await supabase
      .from("saved_sim_matches")
      .select("id")
      .eq("fixture_id", fx.id)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json(
        {
          error: "A saved match already exists for this fixture.",
          existingSavedMatchId: existing.id as string,
        },
        { status: 409 },
      );
    }

    const homeId = fx.home_team_id as string;
    const awayId = fx.away_team_id as string;

    const [{ data: teamRows }, { data: playersRaw }] = await Promise.all([
      supabase.from("teams").select("id, name, logo_url").in("id", [homeId, awayId]),
      supabase
        .from("players")
        .select(
          "id, name, nationality, role, rating, hidden_ovr, profile_pic_url, team_id",
        )
        .in("team_id", [homeId, awayId]),
    ]);

    const homeRow = teamRows?.find((t) => t.id === homeId);
    const awayRow = teamRows?.find((t) => t.id === awayId);
    if (!homeRow || !awayRow) {
      return NextResponse.json({ error: "Team row missing." }, { status: 500 });
    }

    const homePlayers = (playersRaw ?? []).filter((p) => p.team_id === homeId) as DbPlayerRow[];
    const awayPlayers = (playersRaw ?? []).filter((p) => p.team_id === awayId) as DbPlayerRow[];

    const homePick = pickClubLineup(homePlayers);
    const awayPick = pickClubLineup(awayPlayers);
    if (homePick.error) {
      return NextResponse.json({ error: `Home: ${homePick.error}` }, { status: 400 });
    }
    if (awayPick.error) {
      return NextResponse.json({ error: `Away: ${awayPick.error}` }, { status: 400 });
    }

    const split = splitFixtureScore(
      fx.home_score as number,
      fx.away_score as number,
      fx.score_detail,
    );

    const homeSts = homePick.lineup.filter((p) => p.role === "ST");
    const awaySts = awayPick.lineup.filter((p) => p.role === "ST");

    return NextResponse.json({
      fixture: {
        id: fx.id,
        season_label: fx.season_label,
        week: fx.week,
        competition: fx.competition,
        cup_round: fx.cup_round,
        home_team_id: homeId,
        away_team_id: awayId,
        home_score: fx.home_score,
        away_score: fx.away_score,
        score_detail: fx.score_detail,
      },
      split,
      homeTeam: { id: homeRow.id, name: homeRow.name, logo_url: homeRow.logo_url },
      awayTeam: { id: awayRow.id, name: awayRow.name, logo_url: awayRow.logo_url },
      homeStrikers: homeSts.map((p) => ({
        id: p.id,
        name: p.name,
      })),
      awayStrikers: awaySts.map((p) => ({
        id: p.id,
        name: p.name,
      })),
      expectedHomeScorerCount: split.regH + split.etH,
      expectedAwayScorerCount: split.regA + split.etA,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const fixtureId = (body.fixtureId ?? "").trim();
    if (!fixtureId) {
      return NextResponse.json({ error: "fixtureId required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: fx, error: fxe } = await supabase
      .from("fixtures")
      .select(
        "id, season_label, home_team_id, away_team_id, home_score, away_score, score_detail, status",
      )
      .eq("id", fixtureId)
      .maybeSingle();

    if (fxe || !fx) {
      return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
    }
    if (fx.status !== "completed") {
      return NextResponse.json({ error: "Fixture not completed." }, { status: 400 });
    }
    if (typeof fx.home_score !== "number" || typeof fx.away_score !== "number") {
      return NextResponse.json({ error: "Fixture missing scores." }, { status: 400 });
    }

    const { data: dupe } = await supabase
      .from("saved_sim_matches")
      .select("id")
      .eq("fixture_id", fx.id)
      .maybeSingle();
    if (dupe?.id) {
      return NextResponse.json(
        { error: "Saved match already exists.", existingSavedMatchId: dupe.id as string },
        { status: 409 },
      );
    }

    const homeId = fx.home_team_id as string;
    const awayId = fx.away_team_id as string;

    const { data: playersRaw, error: pe } = await supabase
      .from("players")
      .select(
        "id, name, nationality, role, rating, hidden_ovr, profile_pic_url, team_id",
      )
      .in("team_id", [homeId, awayId]);
    if (pe) throw new Error(pe.message);

    const homePlayers = (playersRaw ?? []).filter((p) => p.team_id === homeId) as DbPlayerRow[];
    const awayPlayers = (playersRaw ?? []).filter((p) => p.team_id === awayId) as DbPlayerRow[];

    const homePick = pickClubLineup(homePlayers);
    const awayPick = pickClubLineup(awayPlayers);
    if (homePick.error) {
      return NextResponse.json({ error: `Home: ${homePick.error}` }, { status: 400 });
    }
    if (awayPick.error) {
      return NextResponse.json({ error: `Away: ${awayPick.error}` }, { status: 400 });
    }

    const split = splitFixtureScore(
      fx.home_score as number,
      fx.away_score as number,
      fx.score_detail,
    );

    const homeScorerIds = Array.isArray(body.homeScorerIds) ? body.homeScorerIds : [];
    const awayScorerIds = Array.isArray(body.awayScorerIds) ? body.awayScorerIds : [];

    const homeStrikerSet = new Set(
      homePick.lineup.filter((p) => p.role === "ST").map((p) => p.id),
    );
    const awayStrikerSet = new Set(
      awayPick.lineup.filter((p) => p.role === "ST").map((p) => p.id),
    );

    for (const id of homeScorerIds) {
      if (!homeStrikerSet.has(id)) {
        return NextResponse.json(
          { error: `Invalid home scorer id (must be a home striker): ${id}` },
          { status: 400 },
        );
      }
    }
    for (const id of awayScorerIds) {
      if (!awayStrikerSet.has(id)) {
        return NextResponse.json(
          { error: `Invalid away scorer id (must be an away striker): ${id}` },
          { status: 400 },
        );
      }
    }

    let shots;
    try {
      shots = buildSyntheticShots({
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeLineup: homePick.lineup,
        awayLineup: awayPick.lineup,
        split,
        homeScorerIds,
        awayScorerIds,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not build shots" },
        { status: 400 },
      );
    }

    const { data: teamRows, error: te } = await supabase
      .from("teams")
      .select("id, name, logo_url")
      .in("id", [homeId, awayId]);
    if (te) throw new Error(te.message);
    const homeRow = teamRows?.find((t) => t.id === homeId);
    const awayRow = teamRows?.find((t) => t.id === awayId);
    if (!homeRow || !awayRow) throw new Error("Teams missing");

    const natNames = [...homePick.lineup, ...awayPick.lineup].map((p) => p.nationality);
    const flagByNat = await flagEmojiByNationalityNames(supabase, natNames);

    const toSetup = (lineup: DbPlayerRow[]) =>
      lineup.map((p) => ({
        id: p.id,
        name: p.name,
        nationality: p.nationality,
        role: p.role,
        rating: simOvrNum(p),
        profile_pic_url: p.profile_pic_url,
        flag_emoji: flagByNat.get(p.nationality) ?? null,
      }));

    const lineups = {
      home: {
        id: homeRow.id,
        name: homeRow.name,
        logoUrl: homeRow.logo_url,
        players: toSetup(homePick.lineup),
      },
      away: {
        id: awayRow.id,
        name: awayRow.name,
        logoUrl: awayRow.logo_url,
        players: toSetup(awayPick.lineup),
      },
    };

    const stats = aggregateStatsFromShots(shots);
    const fotMobIn = body.fotMobByPlayerId ?? {};

    const player_results: {
      id: string;
      fotMob: number;
      goals?: number;
      saves?: number;
    }[] = [];

    for (const p of [...homePick.lineup, ...awayPick.lineup]) {
      const custom = fotMobIn[p.id];
      let fotMob: number;
      if (typeof custom === "number" && Number.isFinite(custom)) {
        fotMob = Math.round(Math.min(10, Math.max(0, custom)) * 10) / 10;
      } else if (p.role === "ST") {
        const g = stats.goals.get(p.id) ?? 0;
        const sh = stats.shotsByStriker.get(p.id) ?? 0;
        fotMob = Math.min(10, Math.max(4, 6 + g * 0.7 + (sh > 0 ? 0.2 : 0)));
        fotMob = Math.round(fotMob * 10) / 10;
      } else {
        const sv = stats.savesByGk.get(p.id) ?? 0;
        const fc = stats.facedByGk.get(p.id) ?? 0;
        fotMob = Math.min(10, Math.max(4, 6 + sv * 0.35 - (fc - sv) * 0.25));
        fotMob = Math.round(fotMob * 10) / 10;
      }

      const row: (typeof player_results)[0] = { id: p.id, fotMob };
      if (p.role === "ST") {
        const g = stats.goals.get(p.id) ?? 0;
        if (g > 0) row.goals = g;
      } else {
        const sv = stats.savesByGk.get(p.id) ?? 0;
        if (sv > 0) row.saves = sv;
      }
      player_results.push(row);
    }

    player_results.sort((a, b) => a.id.localeCompare(b.id));

    const scoreBreakdownRaw = fx.score_detail as
      | {
          displayLine?: string;
          regulationHome?: number;
          regulationAway?: number;
          finalHome?: number;
          finalAway?: number;
          etPeriodsPlayed?: number;
          suddenDeath?: boolean;
        }
      | null
      | undefined;

    const score_breakdown =
      scoreBreakdownRaw && typeof scoreBreakdownRaw.displayLine === "string" ?
        {
          displayLine: scoreBreakdownRaw.displayLine,
          regulationHome: scoreBreakdownRaw.regulationHome,
          regulationAway: scoreBreakdownRaw.regulationAway,
          finalHome: scoreBreakdownRaw.finalHome,
          finalAway: scoreBreakdownRaw.finalAway,
          etPeriodsPlayed: scoreBreakdownRaw.etPeriodsPlayed ?? 0,
          suddenDeath: !!scoreBreakdownRaw.suddenDeath,
        }
      : null;

    const { data: inserted, error: insErr } = await supabase
      .from("saved_sim_matches")
      .insert({
        season_label: fx.season_label as string,
        home_team_id: homeId,
        away_team_id: awayId,
        home_score: fx.home_score as number,
        away_score: fx.away_score as number,
        fixture_id: fx.id,
        shots,
        lineups,
        player_results,
        score_breakdown,
      })
      .select("id")
      .single();

    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({
      ok: true,
      savedMatchId: inserted?.id as string,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function simOvrNum(p: DbPlayerRow): number {
  return p.hidden_ovr ?? p.rating;
}

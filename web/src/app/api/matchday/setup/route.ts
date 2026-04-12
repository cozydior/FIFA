import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { flagEmojiByNationalityNames } from "@/lib/nationalityFlags";
import type { SimPlayer, SimTeam } from "@/lib/simEngine";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { buildSimTeamForNationalTeam } from "@/lib/internationalSim";
import { isClubKnockoutSim } from "@/lib/fixtureKnockout";

type DbPlayer = {
  id: string;
  name: string;
  nationality: string;
  role: string;
  rating: number;
  hidden_ovr?: number | null;
  profile_pic_url: string | null;
  team_id: string | null;
};

function simOvr(p: DbPlayer): number {
  return p.hidden_ovr ?? p.rating;
}

function pickLineup(players: DbPlayer[]): {
  lineup: DbPlayer[];
  error?: string;
} {
  const sts = players
    .filter((p) => p.role === "ST")
    .sort((a, b) => simOvr(b) - simOvr(a))
    .slice(0, 2);
  const gks = players
    .filter((p) => p.role === "GK")
    .sort((a, b) => simOvr(b) - simOvr(a))
    .slice(0, 1);
  if (sts.length < 2) {
    return { lineup: [], error: "Need at least 2 ST players on the team." };
  }
  if (gks.length < 1) {
    return { lineup: [], error: "Need at least 1 GK on the team." };
  }
  return { lineup: [...sts, ...gks] };
}

function toSimPlayers(lineup: DbPlayer[]): {
  strikers: [SimPlayer, SimPlayer];
  goalkeeper: SimPlayer;
} {
  const sts = lineup.filter((p) => p.role === "ST");
  const gk = lineup.find((p) => p.role === "GK")!;
  return {
    strikers: [
      {
        id: sts[0].id,
        rating: simOvr(sts[0]),
        role: "ST",
        name: sts[0].name,
      },
      {
        id: sts[1].id,
        rating: simOvr(sts[1]),
        role: "ST",
        name: sts[1].name,
      },
    ],
    goalkeeper: {
      id: gk.id,
      rating: simOvr(gk),
      role: "GK",
      name: gk.name,
    },
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const intlFixtureId = searchParams.get("intlFixtureId");

    const supabase = getSupabaseAdmin();

    if (intlFixtureId?.trim()) {
      const { data: fx, error: fxe } = await supabase
        .from("international_fixtures")
        .select("id, status, home_national_team_id, away_national_team_id, competition_id, stage")
        .eq("id", intlFixtureId.trim())
        .maybeSingle();

      if (fxe || !fx) {
        return NextResponse.json({ error: "International fixture not found." }, { status: 404 });
      }
      if (fx.status !== "scheduled") {
        return NextResponse.json(
          { error: "This international fixture is not scheduled (already played?)." },
          { status: 400 },
        );
      }

      const { data: comp, error: ce } = await supabase
        .from("international_competitions")
        .select("season_label, slug")
        .eq("id", fx.competition_id)
        .maybeSingle();
      if (ce || !comp?.season_label) {
        return NextResponse.json({ error: "Competition not found." }, { status: 404 });
      }
      const seasonLabel = comp.season_label;

      const [homeSim, awaySim] = await Promise.all([
        buildSimTeamForNationalTeam(supabase, fx.home_national_team_id, seasonLabel),
        buildSimTeamForNationalTeam(supabase, fx.away_national_team_id, seasonLabel),
      ]);
      if (!homeSim || !awaySim) {
        return NextResponse.json(
          {
            error:
              "Missing call-ups for one or both nations (Admin → International call-ups: 2× ST + GK1 per side).",
          },
          { status: 400 },
        );
      }

      const { data: ntRows } = await supabase
        .from("national_teams")
        .select("id, name, flag_emoji, countries(code, flag_emoji)")
        .in("id", [fx.home_national_team_id, fx.away_national_team_id]);

      const ntMeta = new Map(
        (ntRows ?? []).map((row: Record<string, unknown>) => {
          const c = row.countries as
            | { code?: string | null; flag_emoji?: string | null }
            | { code?: string | null; flag_emoji?: string | null }[]
            | null;
          const country = Array.isArray(c) ? c[0] : c;
          const code =
            typeof country?.code === "string" ? country.code.toLowerCase() : null;
          const flag =
            (typeof country?.flag_emoji === "string" && country.flag_emoji.trim() ?
              country.flag_emoji
            : null) ??
            (typeof row.flag_emoji === "string" ? row.flag_emoji : null) ??
            "🏳️";
          return [row.id as string, { name: row.name as string, flag, countryCode: code }];
        }),
      );

      const lineupIds = [
        homeSim.strikers[0]!.id,
        homeSim.strikers[1]!.id,
        homeSim.goalkeeper.id,
        awaySim.strikers[0]!.id,
        awaySim.strikers[1]!.id,
        awaySim.goalkeeper.id,
      ];
      const { data: plRows } = await supabase
        .from("players")
        .select("id, name, nationality, role, rating, hidden_ovr, profile_pic_url")
        .in("id", lineupIds);

      const byId = new Map((plRows ?? []).map((p) => [p.id, p]));
      const flagByNat = await flagEmojiByNationalityNames(
        supabase,
        (plRows ?? []).map((p) => p.nationality),
      );
      const toSetup = (sim: SimTeam) =>
        [sim.strikers[0]!, sim.strikers[1]!, sim.goalkeeper].map((sp) => {
          const row = byId.get(sp.id);
          if (!row) throw new Error(`Player ${sp.id} missing`);
          return {
            id: row.id,
            name: row.name,
            nationality: row.nationality,
            role: row.role,
            rating: row.hidden_ovr ?? row.rating,
            profile_pic_url: row.profile_pic_url,
            flag_emoji: flagByNat.get(row.nationality) ?? null,
          };
        });

      type Nt = { name: string; flag: string; countryCode: string | null };
      const homeNt = ntMeta.get(fx.home_national_team_id) as Nt | undefined;
      const awayNt = ntMeta.get(fx.away_national_team_id) as Nt | undefined;

      const knockout = fx.stage !== "group";

      return NextResponse.json({
        matchKind: "international",
        internationalFixtureId: fx.id,
        competitionSlug: comp.slug,
        seasonLabel,
        knockout,
        home: {
          id: fx.home_national_team_id,
          name: homeNt?.name ?? "Home",
          logoUrl: null,
          flagEmoji: homeNt?.flag ?? "🏳️",
          countryCode: homeNt?.countryCode ?? null,
          players: toSetup(homeSim),
        },
        away: {
          id: fx.away_national_team_id,
          name: awayNt?.name ?? "Away",
          logoUrl: null,
          flagEmoji: awayNt?.flag ?? "🏳️",
          countryCode: awayNt?.countryCode ?? null,
          players: toSetup(awaySim),
        },
        simHome: homeSim,
        simAway: awaySim,
      });
    }

    const homeId = searchParams.get("homeTeamId");
    const awayId = searchParams.get("awayTeamId");
    const clubFixtureId = searchParams.get("fixtureId");
    if (!homeId || !awayId) {
      return NextResponse.json(
        { error: "Provide homeTeamId and awayTeamId for clubs, or intlFixtureId for an international match." },
        { status: 400 },
      );
    }
    if (homeId === awayId) {
      return NextResponse.json(
        { error: "Home and away must be different teams." },
        { status: 400 },
      );
    }
    const { data: teams, error: te } = await supabase
      .from("teams")
      .select("id, name, logo_url")
      .in("id", [homeId, awayId]);

    if (te) throw new Error(te.message);
    const homeRow = teams?.find((t) => t.id === homeId);
    const awayRow = teams?.find((t) => t.id === awayId);
    if (!homeRow || !awayRow) {
      return NextResponse.json(
        { error: "One or both teams not found." },
        { status: 404 },
      );
    }

    const { data: playersRaw, error: pe } = await supabase
      .from("players")
      .select(
        "id, name, nationality, role, rating, hidden_ovr, profile_pic_url, team_id",
      )
      .in("team_id", [homeId, awayId]);

    if (pe) throw new Error(pe.message);

    const homePlayers = (playersRaw ?? []).filter((p) => p.team_id === homeId);
    const awayPlayers = (playersRaw ?? []).filter((p) => p.team_id === awayId);

    const homePick = pickLineup(homePlayers as DbPlayer[]);
    const awayPick = pickLineup(awayPlayers as DbPlayer[]);
    if (homePick.error) {
      return NextResponse.json({ error: `Home: ${homePick.error}` }, { status: 400 });
    }
    if (awayPick.error) {
      return NextResponse.json({ error: `Away: ${awayPick.error}` }, { status: 400 });
    }

    const flagByNat = await flagEmojiByNationalityNames(supabase, [
      ...homePick.lineup.map((p) => p.nationality),
      ...awayPick.lineup.map((p) => p.nationality),
    ]);
    const withFlags = (lineup: DbPlayer[]) =>
      lineup.map((p) => ({
        id: p.id,
        name: p.name,
        nationality: p.nationality,
        role: p.role,
        rating: p.hidden_ovr ?? p.rating,
        profile_pic_url: p.profile_pic_url,
        flag_emoji: flagByNat.get(p.nationality) ?? null,
      }));

    const homeSim = toSimPlayers(homePick.lineup);
    const awaySim = toSimPlayers(awayPick.lineup);

    const simHome: SimTeam = {
      id: homeId,
      name: homeRow.name,
      strikers: homeSim.strikers,
      goalkeeper: homeSim.goalkeeper,
    };
    const simAway: SimTeam = {
      id: awayId,
      name: awayRow.name,
      strikers: awaySim.strikers,
      goalkeeper: awaySim.goalkeeper,
    };

    const seasonLabel = await getCurrentSeasonLabel();
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "No season selected. Create/set a current season in Admin." },
        { status: 400 },
      );
    }

    let knockout = false;
    if (clubFixtureId?.trim()) {
      const { data: cfx } = await supabase
        .from("fixtures")
        .select("id, home_team_id, away_team_id, competition, cup_round")
        .eq("id", clubFixtureId.trim())
        .maybeSingle();
      if (
        cfx &&
        ((cfx.home_team_id === homeId && cfx.away_team_id === awayId) ||
          (cfx.home_team_id === awayId && cfx.away_team_id === homeId))
      ) {
        knockout = isClubKnockoutSim(cfx.competition ?? null, cfx.cup_round ?? null);
      }
    }

    return NextResponse.json({
      matchKind: "club",
      seasonLabel,
      knockout,
      home: {
        id: homeRow.id,
        name: homeRow.name,
        logoUrl: homeRow.logo_url,
        flagEmoji: null,
        players: withFlags(homePick.lineup),
      },
      away: {
        id: awayRow.id,
        name: awayRow.name,
        logoUrl: awayRow.logo_url,
        flagEmoji: null,
        players: withFlags(awayPick.lineup),
      },
      simHome,
      simAway,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Setup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

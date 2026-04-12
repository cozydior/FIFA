import { NextResponse } from "next/server";
import { fetchLeagueStandingsForSeasonEnd } from "@/lib/seasonEconomy";
import { persistSeasonEndToSupabase } from "@/lib/seasonEndPersistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getCurrentSeasonLabel,
  nextSeasonLabelAfter,
  setCurrentSeasonLabel,
} from "@/lib/seasonSettings";

/**
 * Computes league tables from completed fixtures, then promotion/relegation
 * and optional league + promotion prize money. CL DB rows are optional (see `seedChampionsLeague`).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      seasonLabel?: string;
      skipLeaguePayouts?: boolean;
      /** After P/R, set current season to next (e.g. Season 1 → Season 2) and upsert seasons row. */
      advanceSeason?: boolean;
      /** When true, write Champions League tournament + entries for the closed season. Default false. */
      seedChampionsLeague?: boolean;
    };
    const seasonLabel =
      typeof body.seasonLabel === "string" && body.seasonLabel.trim()
        ? body.seasonLabel.trim()
        : await getCurrentSeasonLabel();
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "No season selected. Create/set a current season in Admin." },
        { status: 400 },
      );
    }
    const skipLeaguePayouts = body.skipLeaguePayouts === true;
    const seedChampionsLeague = body.seedChampionsLeague === true;

    const supabase = getSupabaseAdmin();
    const { standings, leagues } = await fetchLeagueStandingsForSeasonEnd(
      supabase,
      seasonLabel,
    );

    if (standings.length === 0) {
      return NextResponse.json(
        {
          error:
            "No league standings found. Ensure teams are assigned to leagues and league fixtures exist for this season.",
        },
        { status: 400 },
      );
    }

    const out = await persistSeasonEndToSupabase({
      seasonLabel,
      standings,
      leagues,
      applyLeaguePayouts: !skipLeaguePayouts,
      seedChampionsLeague,
    });

    let nextSeasonLabel: string | null = null;
    if (body.advanceSeason === true) {
      nextSeasonLabel = nextSeasonLabelAfter(seasonLabel);
      await setCurrentSeasonLabel(nextSeasonLabel);
    }

    return NextResponse.json({
      seasonLabel,
      nextSeasonLabel,
      seasonId: out.seasonId,
      tournamentId: out.tournamentId,
      championsLeagueSeeded: out.championsLeagueSeeded,
      championsLeagueQualifiers: out.result.championsLeagueQualifiers.length,
      teamLeagueUpdates: out.result.teamLeagueUpdates.length,
      leaguePayouts: out.leaguePayouts,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Season end failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

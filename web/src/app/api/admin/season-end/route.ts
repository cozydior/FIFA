import { NextResponse } from "next/server";
import { fetchLeagueStandingsForSeasonEnd } from "@/lib/seasonEconomy";
import { persistSeasonEndToSupabase } from "@/lib/seasonEndPersistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

/**
 * Computes league tables from completed fixtures, then promotion/relegation,
 * CL qualification, and optional league + promotion prize money.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      seasonLabel?: string;
      skipLeaguePayouts?: boolean;
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
    });

    return NextResponse.json({
      seasonLabel,
      seasonId: out.seasonId,
      tournamentId: out.tournamentId,
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

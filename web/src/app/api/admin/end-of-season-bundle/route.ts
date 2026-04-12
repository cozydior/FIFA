import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { applySeasonWages } from "@/lib/economyServer";
import { fetchLeagueStandingsForSeasonEnd } from "@/lib/seasonEconomy";
import {
  applyPendingRegionalCupFinalPayouts,
  applyChampionsLeaguePayoutsFromFixtures,
  recalculateAllPlayerMarketValues,
} from "@/lib/seasonEconomy";
import { persistSeasonEndToSupabase } from "@/lib/seasonEndPersistence";

/**
 * One-button end-of-season action:
 * 1. Season end (promotion/relegation + league/promotion prizes; CL DB seeding off by default)
 * 2. All pending regional cup final payouts
 * 3. Champions League prize money (auto-detected from CL_F fixture)
 * 4. Season wages (50% squad MV)
 * 5. Recalculate all player market values from hidden OVR
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      seasonLabel?: string;
      skipSeasonEnd?: boolean;
      skipCupPayouts?: boolean;
      skipClPayouts?: boolean;
      skipWages?: boolean;
      skipMarketValues?: boolean;
      /** When true, also seed CL tournament_entries for the closed season (same as season-end API). */
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

    const supabase = getSupabaseAdmin();
    const result: Record<string, unknown> = { seasonLabel };

    if (!body.skipSeasonEnd) {
      const { standings, leagues } = await fetchLeagueStandingsForSeasonEnd(supabase, seasonLabel);
      if (standings.length === 0) {
        return NextResponse.json(
          { error: "Season end: no league standings found. Ensure teams are in leagues with fixtures." },
          { status: 400 },
        );
      }
      const out = await persistSeasonEndToSupabase({
        seasonLabel,
        standings,
        leagues,
        applyLeaguePayouts: true,
        seedChampionsLeague: body.seedChampionsLeague === true,
      });
      result.seasonEnd = {
        championsLeagueSeeded: out.championsLeagueSeeded,
        championsLeagueQualifiers: out.result.championsLeagueQualifiers.length,
        teamLeagueUpdates: out.result.teamLeagueUpdates.length,
        leaguePayouts: out.leaguePayouts,
      };
    }

    if (!body.skipCupPayouts) {
      result.regionalCupPayouts = await applyPendingRegionalCupFinalPayouts(supabase, seasonLabel);
    }

    if (!body.skipClPayouts) {
      result.championsLeaguePayouts = await applyChampionsLeaguePayoutsFromFixtures(supabase, seasonLabel);
    }

    if (!body.skipWages) {
      const wages = await applySeasonWages(supabase, seasonLabel);
      result.wages = {
        charged: wages.results.length,
        skippedAlreadyPaid: wages.skippedAlreadyPaid,
        teamCount: wages.teamCount,
      };
    }

    if (!body.skipMarketValues) {
      result.marketValues = await recalculateAllPlayerMarketValues(supabase, seasonLabel);
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "End-of-season bundle failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

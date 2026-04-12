import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import {
  fetchLeagueStandingsForSeasonEnd,
  applySeasonLeaguePayouts,
} from "@/lib/seasonEconomy";

/**
 * League title + placement prizes from final tables only (no team moves, no CL seeding).
 * Uses same standings math as season end. Idempotent via season_economy_events.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { seasonLabel?: string };
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
    const { standings, leagues } = await fetchLeagueStandingsForSeasonEnd(
      supabase,
      seasonLabel,
    );
    if (standings.length === 0) {
      return NextResponse.json(
        {
          error:
            "No league standings found. Ensure league fixtures exist for this season.",
        },
        { status: 400 },
      );
    }

    const leaguePayouts = await applySeasonLeaguePayouts(
      supabase,
      seasonLabel,
      standings,
      leagues,
    );

    return NextResponse.json({ ok: true, seasonLabel, leaguePayouts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "League payouts failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncPlayerMarketValueHistoryForSeason } from "@/lib/seasonEconomy";

/**
 * Copies every player's current `market_value` into `player_market_value_history` for the given
 * `seasonLabel`. Use once to repair charts / trends after intl games (before the persistence fix)
 * or if history drifted from `players`.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { seasonLabel?: string };
    const seasonLabel =
      typeof body.seasonLabel === "string" && body.seasonLabel.trim()
        ? body.seasonLabel.trim()
        : "";
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "Provide seasonLabel (e.g. the season whose graph point should match current MV)." },
        { status: 400 },
      );
    }
    const supabase = getSupabaseAdmin();
    const result = await syncPlayerMarketValueHistoryForSeason(supabase, seasonLabel);
    return NextResponse.json({ ok: true, seasonLabel, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

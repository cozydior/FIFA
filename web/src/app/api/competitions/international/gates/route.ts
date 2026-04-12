import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  canBootstrapNationsLeagueOrGoldCup,
  canDrawWorldCupGroups,
  canSeedChampionsLeagueFixtures,
} from "@/lib/tournamentGates";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonLabel =
      (searchParams.get("seasonLabel") ?? "").trim() || (await getCurrentSeasonLabel()) || "";
    if (!seasonLabel) {
      return NextResponse.json({ error: "No season label" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const [cl, nlGc, wc] = await Promise.all([
      canSeedChampionsLeagueFixtures(supabase, seasonLabel),
      canBootstrapNationsLeagueOrGoldCup(supabase, seasonLabel),
      canDrawWorldCupGroups(supabase, seasonLabel),
    ]);
    return NextResponse.json({
      seasonLabel,
      championsLeague: cl,
      nationsLeagueOrGoldCup: nlGc,
      worldCupDraw: wc,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

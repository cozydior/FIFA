import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { applyChampionsLeaguePayoutsFromFixtures } from "@/lib/seasonEconomy";

/** CL prize money from completed CL_F fixture (same logic as end-of-season bundle). */
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
    const championsLeaguePayouts = await applyChampionsLeaguePayoutsFromFixtures(
      supabase,
      seasonLabel,
    );
    return NextResponse.json({ ok: true, seasonLabel, championsLeaguePayouts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

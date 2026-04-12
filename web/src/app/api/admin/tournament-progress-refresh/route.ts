import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import {
  progressChampionsLeagueKnockouts,
  progressRegionalCupKnockouts,
} from "@/lib/regionalCupProgress";

/** Manual backfill: same logic as matchday auto-progress (regional cups + CL knockouts). */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { seasonLabel?: string };
    const seasonLabel =
      typeof body.seasonLabel === "string" && body.seasonLabel.trim()
        ? body.seasonLabel.trim()
        : await getCurrentSeasonLabel();
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "No season label. Set current season or pass seasonLabel." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const regional = await progressRegionalCupKnockouts(supabase, seasonLabel);
    const cl = await progressChampionsLeagueKnockouts(supabase, seasonLabel);

    return NextResponse.json({
      ok: true,
      seasonLabel,
      regionalCup: regional,
      championsLeague: cl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

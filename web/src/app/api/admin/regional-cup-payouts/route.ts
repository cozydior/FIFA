import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { applyPendingRegionalCupFinalPayouts } from "@/lib/seasonEconomy";

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
    const regionalCupPayouts = await applyPendingRegionalCupFinalPayouts(
      supabase,
      seasonLabel,
    );
    return NextResponse.json({ ok: true, seasonLabel, regionalCupPayouts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

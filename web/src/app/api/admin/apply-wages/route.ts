import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applySeasonWages } from "@/lib/economyServer";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const season =
      typeof body.seasonLabel === "string" && body.seasonLabel.trim()
        ? body.seasonLabel.trim()
        : await getCurrentSeasonLabel();
    if (!season) {
      return NextResponse.json(
        { error: "No season selected. Create/set a current season in Admin." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const results = await applySeasonWages(supabase, season);
    return NextResponse.json({ ok: true, season, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

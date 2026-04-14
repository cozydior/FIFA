import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { generateInternationalFriendlies } from "@/lib/internationalFriendlies";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { seasonLabel?: string };
    const seasonLabel =
      typeof body.seasonLabel === "string" && body.seasonLabel.trim() ?
        body.seasonLabel.trim()
      : (await getCurrentSeasonLabel()) ?? "";
    if (!seasonLabel) {
      return NextResponse.json({ error: "No season label provided or set as current." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const out = await generateInternationalFriendlies(supabase, seasonLabel);
    return NextResponse.json({ ok: true, seasonLabel, ...out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate friendlies";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

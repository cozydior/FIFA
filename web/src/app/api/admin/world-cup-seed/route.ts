import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTournamentsMode } from "@/lib/appSettings";
import { seedWorldCupFromQualifiers } from "@/lib/worldCupAdmin";

export async function POST(req: Request) {
  try {
    const on = await getTournamentsMode();
    if (!on) {
      return NextResponse.json(
        { error: "Turn on Tournaments mode in Admin → Season." },
        { status: 403 },
      );
    }
    const body = (await req.json().catch(() => ({}))) as {
      worldCupSeasonLabel?: string;
      qualifierSeasonLabel?: string;
    };
    const worldCupSeasonLabel =
      typeof body.worldCupSeasonLabel === "string" ? body.worldCupSeasonLabel.trim() : "";
    const qualifierSeasonLabel =
      typeof body.qualifierSeasonLabel === "string" ? body.qualifierSeasonLabel.trim() : "";
    if (!worldCupSeasonLabel || !qualifierSeasonLabel) {
      return NextResponse.json(
        { error: "Provide worldCupSeasonLabel and qualifierSeasonLabel." },
        { status: 400 },
      );
    }
    const supabase = getSupabaseAdmin();
    const result = await seedWorldCupFromQualifiers(
      supabase,
      worldCupSeasonLabel,
      qualifierSeasonLabel,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, worldCupSeasonLabel, qualifierSeasonLabel });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

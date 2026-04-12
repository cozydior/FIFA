import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTournamentsMode } from "@/lib/appSettings";
import { refreshClSemisFromGroupTables } from "@/lib/championsLeaguePreview";

/**
 * Deletes CL semi + final fixtures for the season and re-creates semis from group tables (if groups are complete).
 */
export async function POST(req: Request) {
  try {
    const tournamentsOn = await getTournamentsMode();
    if (!tournamentsOn) {
      return NextResponse.json(
        { error: "Turn on Tournaments mode in Admin → Season to refresh Champions League semis." },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { seasonLabel?: string };
    const supabase = getSupabaseAdmin();

    let seasonLabel = typeof body.seasonLabel === "string" ? body.seasonLabel.trim() : "";
    if (!seasonLabel) {
      const { data: s } = await supabase
        .from("seasons")
        .select("label")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      seasonLabel = s?.label?.trim() ?? "";
    }
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "seasonLabel required or create a season first." },
        { status: 400 },
      );
    }

    const out = await refreshClSemisFromGroupTables(supabase, seasonLabel);
    return NextResponse.json({
      ok: true,
      seasonLabel,
      deleted: out.deleted,
      inserted: out.inserted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

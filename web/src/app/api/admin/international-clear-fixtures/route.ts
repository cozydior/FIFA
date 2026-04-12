import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTournamentsMode } from "@/lib/appSettings";

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
      seasonLabel?: string;
      /** Ignored — only World Cup fixtures can be cleared via this route. */
      slug?: string;
      /** Also remove international_entries for this competition (e.g. reset WC field). */
      clearEntries?: boolean;
    };
    const seasonLabel = typeof body.seasonLabel === "string" ? body.seasonLabel.trim() : "";
    const slug = "world_cup" as const;
    if (!seasonLabel) {
      return NextResponse.json({ error: "Provide seasonLabel (World Cup season)." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data: comp } = await supabase
      .from("international_competitions")
      .select("id")
      .eq("season_label", seasonLabel)
      .eq("slug", slug)
      .maybeSingle();
    if (!comp) {
      return NextResponse.json({ error: "Competition not found for that season/slug." }, { status: 404 });
    }
    const { error: fe } = await supabase
      .from("international_fixtures")
      .delete()
      .eq("competition_id", comp.id);
    if (fe) throw new Error(fe.message);
    let entriesDeleted = 0;
    if (body.clearEntries) {
      const { data: del, error: ee } = await supabase
        .from("international_entries")
        .delete()
        .eq("competition_id", comp.id)
        .select("id");
      if (ee) throw new Error(ee.message);
      entriesDeleted = del?.length ?? 0;
    }
    return NextResponse.json({
      ok: true,
      fixturesCleared: true,
      entriesCleared: Boolean(body.clearEntries),
      entriesDeleted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

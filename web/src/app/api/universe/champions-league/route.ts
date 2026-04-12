import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildChampionsLeagueSchedule } from "@/lib/universe/championsLeague";

/** Returns CL group + KO skeleton from current tournament_entries (6 teams). */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: season } = await supabase
      .from("seasons")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!season?.id) {
      return NextResponse.json({
        message: "No season row in the database yet. Create a season (e.g. Admin → current season) before building CL.",
        schedule: null,
      });
    }

    const { data: t } = await supabase
      .from("tournaments")
      .select("id")
      .eq("slug", "champions_league")
      .eq("season_id", season.id)
      .maybeSingle();

    if (!t?.id) {
      return NextResponse.json({
        message: "No Champions League tournament for latest season.",
        schedule: null,
      });
    }

    const { data: entries } = await supabase
      .from("tournament_entries")
      .select("team_id")
      .eq("tournament_id", t.id);

    const ids = (entries ?? []).map((e) => e.team_id);
    if (ids.length !== 6) {
      return NextResponse.json({
        message: `Need 6 CL qualifiers; have ${ids.length}.`,
        teamIds: ids,
        schedule: null,
      });
    }

    const schedule = buildChampionsLeagueSchedule(ids);
    return NextResponse.json({ schedule });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

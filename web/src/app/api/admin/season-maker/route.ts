import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildSeasonMasterFromDatabase } from "@/lib/seasonMasterData";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

/** Creates/recreates fixtures for a season label from current league/team setup. */
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
    const { schedule, warnings } = await buildSeasonMasterFromDatabase();

    const { error: se } = await supabase
      .from("seasons")
      .upsert({ label: seasonLabel }, { onConflict: "label" });
    if (se) throw new Error(se.message);

    const { error: de } = await supabase
      .from("fixtures")
      .delete()
      .eq("season_label", seasonLabel);
    if (de) throw new Error(de.message);

    const fixtureRows: Record<string, unknown>[] = [];
    schedule.forEach((r, idx) => {
      if (r.competition === "league") {
        fixtureRows.push({
          season_label: seasonLabel,
          competition: "league",
          league_id: r.leagueId,
          country: r.country,
          home_team_id: r.homeTeamId,
          away_team_id: r.awayTeamId,
          week: r.week,
          cup_round: null,
          status: "scheduled",
          sort_order: idx,
        });
      } else if (r.round === "QF") {
        fixtureRows.push({
          season_label: seasonLabel,
          competition: "regional_cup",
          league_id: null,
          country: r.country,
          home_team_id: r.homeTeamId,
          away_team_id: r.awayTeamId,
          week: r.week,
          cup_round: "QF",
          status: "scheduled",
          sort_order: idx,
        });
      }
    });

    if (fixtureRows.length > 0) {
      const { error: ie } = await supabase.from("fixtures").insert(fixtureRows);
      if (ie) throw new Error(ie.message);
    }

    return NextResponse.json({
      seasonLabel,
      fixturesCreated: fixtureRows.length,
      warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create season fixtures";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

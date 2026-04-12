import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { insertChampionsLeagueGroupFixtures } from "@/lib/championsLeagueFixtures";
import { fetchLeagueStandingsForSeasonEnd } from "@/lib/seasonEconomy";
import {
  applySeasonEnd,
  championsLeagueQualifiedVia,
} from "@/lib/seasonStructure";
import { canSeedChampionsLeagueFixtures } from "@/lib/tournamentGates";
import { getSimPreviewTestMode, getTournamentsMode } from "@/lib/appSettings";
import { refreshClSemisFromGroupTables } from "@/lib/championsLeaguePreview";

/**
 * Seeds CL tournament_entries + group fixtures. Production mode respects league-completion gates.
 * Preview mode skips gates (only when Admin "Sim preview test mode" is ON).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      seasonLabel?: string;
      /** "production" = real rules; "preview" = bypass gates (requires preview toggle). */
      mode?: "production" | "preview";
    };
    const supabase = getSupabaseAdmin();
    const mode = body.mode === "preview" ? "preview" : "production";

    const tournamentsOn = await getTournamentsMode();
    if (!tournamentsOn) {
      return NextResponse.json(
        { error: "Turn on Tournaments mode in Admin → Season to seed or refresh Champions League." },
        { status: 403 },
      );
    }

    let season: { id: string; label: string } | null = null;
    if (typeof body.seasonLabel === "string" && body.seasonLabel.trim()) {
      const { data } = await supabase
        .from("seasons")
        .select("id, label")
        .eq("label", body.seasonLabel.trim())
        .maybeSingle();
      season = data;
    } else {
      const { data } = await supabase
        .from("seasons")
        .select("id, label")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      season = data;
    }

    if (!season) {
      return NextResponse.json(
        { error: "No season found. Create a season in Admin first (or pass seasonLabel)." },
        { status: 400 },
      );
    }

    if (mode === "preview") {
      const allowed = await getSimPreviewTestMode();
      if (!allowed) {
        return NextResponse.json(
          { error: "Turn on Sim preview test mode in Admin → Season to use preview seed." },
          { status: 403 },
        );
      }
    } else {
      const gate = await canSeedChampionsLeagueFixtures(supabase, season.label);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.reason ?? "Requirements not met" }, { status: 403 });
      }
    }

    const { standings, leagues } = await fetchLeagueStandingsForSeasonEnd(
      supabase,
      season.label,
    );
    if (standings.length === 0) {
      return NextResponse.json(
        {
          error:
            "No league tables for this season. Play or simulate league fixtures so each D1 league has results.",
        },
        { status: 400 },
      );
    }
    const cl = applySeasonEnd(standings, leagues);
    if (cl.championsLeagueQualifiers.length !== 6) {
      return NextResponse.json(
        {
          error:
            `Champions League needs exactly 6 qualifiers (top 2 from each D1 where the country has D1+D2). ` +
            `Found ${cl.championsLeagueQualifiers.length}. ` +
            `Ensure three countries each have D1 and D2 leagues with four teams, and that league tables are complete enough to rank positions 1–2.`,
        },
        { status: 400 },
      );
    }

    const { data: t, error: te } = await supabase
      .from("tournaments")
      .upsert(
        {
          slug: "champions_league",
          name: "UEFA Champions League",
          season_id: season.id,
        },
        { onConflict: "slug,season_id" },
      )
      .select("id")
      .single();

    if (te || !t) {
      return NextResponse.json(
        { error: te?.message ?? "Could not create Champions League tournament row." },
        { status: 500 },
      );
    }

    await supabase.from("tournament_entries").delete().eq("tournament_id", t.id);
    const { error: ie } = await supabase.from("tournament_entries").insert(
      cl.championsLeagueQualifiers.map((q) => ({
        tournament_id: t.id,
        team_id: q.teamId,
        qualified_via:
          mode === "preview"
            ? `${championsLeagueQualifiedVia(q.country, q.position)} (preview)`
            : championsLeagueQualifiedVia(q.country, q.position),
      })),
    );
    if (ie) throw new Error(ie.message);

    await supabase
      .from("fixtures")
      .delete()
      .eq("season_label", season.label)
      .eq("competition", "champions_league");

    const { inserted } = await insertChampionsLeagueGroupFixtures(
      supabase,
      season.label,
      cl.championsLeagueTeamIds,
    );

    const semisRefresh = await refreshClSemisFromGroupTables(supabase, season.label);

    return NextResponse.json({
      ok: true,
      seasonLabel: season.label,
      teamIds: cl.championsLeagueTeamIds,
      groupFixturesInserted: inserted,
      semisDeleted: semisRefresh.deleted,
      semisInserted: semisRefresh.inserted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Seed failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

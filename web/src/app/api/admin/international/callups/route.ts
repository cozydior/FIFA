import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const nationalTeamId = searchParams.get("nationalTeamId");
    const seasonLabel = searchParams.get("season") || (await getCurrentSeasonLabel());
    if (!seasonLabel) {
      return NextResponse.json({ error: "No season selected." }, { status: 400 });
    }
    if (!nationalTeamId) {
      return NextResponse.json({ error: "nationalTeamId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: nt, error: ne } = await supabase
      .from("national_teams")
      .select("id, name, countries(name)")
      .eq("id", nationalTeamId)
      .maybeSingle();
    if (ne) throw new Error(ne.message);
    if (!nt) return NextResponse.json({ error: "National team not found" }, { status: 404 });

    const countryName = Array.isArray(nt.countries)
      ? nt.countries[0]?.name
      : (nt.countries as { name?: string } | null)?.name;
    if (!countryName) {
      return NextResponse.json({ error: "National team country not linked" }, { status: 400 });
    }

    const [{ data: pool, error: pe }, { data: selected, error: se }] = await Promise.all([
      supabase
        .from("players")
        .select("id, name, role, nationality, market_value, profile_pic_url, team_id, teams(name)")
        .eq("nationality", countryName)
        .order("market_value", { ascending: false }),
      supabase
        .from("national_team_callups")
        .select("slot, player_id")
        .eq("season_label", seasonLabel)
        .eq("national_team_id", nationalTeamId),
    ]);
    if (pe) throw new Error(pe.message);
    if (se) throw new Error(se.message);

    return NextResponse.json({
      seasonLabel,
      nationalTeamId,
      countryName,
      pool: pool ?? [],
      selected: selected ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load callups";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      seasonLabel?: string;
      nationalTeamId?: string;
      st1?: string;
      st2?: string;
      gk1?: string;
    };
    const seasonLabel = body.seasonLabel?.trim() || (await getCurrentSeasonLabel());
    if (!seasonLabel) {
      return NextResponse.json({ error: "No season selected." }, { status: 400 });
    }
    if (!body.nationalTeamId || !body.st1 || !body.st2 || !body.gk1) {
      return NextResponse.json(
        { error: "nationalTeamId, st1, st2, gk1 are required" },
        { status: 400 },
      );
    }
    if (new Set([body.st1, body.st2, body.gk1]).size !== 3) {
      return NextResponse.json({ error: "Select 3 different players" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    await supabase
      .from("national_team_callups")
      .delete()
      .eq("season_label", seasonLabel)
      .eq("national_team_id", body.nationalTeamId);

    const rows = [
      { season_label: seasonLabel, national_team_id: body.nationalTeamId, slot: "ST1", player_id: body.st1 },
      { season_label: seasonLabel, national_team_id: body.nationalTeamId, slot: "ST2", player_id: body.st2 },
      { season_label: seasonLabel, national_team_id: body.nationalTeamId, slot: "GK1", player_id: body.gk1 },
    ];
    const { error } = await supabase.from("national_team_callups").insert(rows);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save callups";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


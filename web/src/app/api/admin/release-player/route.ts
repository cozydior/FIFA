import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordTeamTransaction } from "@/lib/economyServer";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

/** Release a player from their club to free agency. Logs a "release" transaction on the club. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { playerId?: string; seasonLabel?: string };

    if (typeof body.playerId !== "string" || !body.playerId.trim()) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

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

    const { data: player, error: pe } = await supabase
      .from("players")
      .select("id, name, team_id, market_value")
      .eq("id", body.playerId.trim())
      .single();
    if (pe || !player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    if (!player.team_id) {
      return NextResponse.json({ error: "Player is already a free agent" }, { status: 400 });
    }

    const fromTeamId = player.team_id as string;

    const { data: club } = await supabase
      .from("teams")
      .select("name")
      .eq("id", fromTeamId)
      .maybeSingle();

    await recordTeamTransaction(supabase, {
      teamId: fromTeamId,
      seasonLabel,
      amount: 0,
      category: "release",
      note: `Released: ${player.name} (MV £${Number(player.market_value ?? 0).toLocaleString()})`,
      alwaysLog: true,
    });

    const { error: ue } = await supabase
      .from("players")
      .update({ team_id: null })
      .eq("id", player.id);
    if (ue) throw new Error(ue.message);

    return NextResponse.json({
      ok: true,
      playerId: player.id,
      playerName: player.name,
      fromTeam: club?.name ?? fromTeamId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Release failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

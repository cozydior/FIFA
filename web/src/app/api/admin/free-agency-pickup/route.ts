import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordTeamTransaction } from "@/lib/economyServer";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import { FREE_AGENT_PICKUP_RATE } from "@/lib/economy";

/** Pick up a free agent: team pays FREE_AGENT_PICKUP_RATE × player's market value. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      playerId?: string;
      toTeamId?: string;
      seasonLabel?: string;
    };

    if (typeof body.playerId !== "string" || !body.playerId.trim()) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }
    if (typeof body.toTeamId !== "string" || !body.toTeamId.trim()) {
      return NextResponse.json({ error: "toTeamId is required" }, { status: 400 });
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
    if (player.team_id) {
      return NextResponse.json(
        { error: "Player is not a free agent — use the transfer section instead" },
        { status: 400 },
      );
    }

    const { data: team, error: te } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", body.toTeamId.trim())
      .single();
    if (te || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const mv = Number(player.market_value ?? 0);
    const fee = Math.round(mv * FREE_AGENT_PICKUP_RATE);

    await recordTeamTransaction(supabase, {
      teamId: team.id,
      seasonLabel,
      amount: -fee,
      category: "free_agent_pickup",
      note: `Pick up free agent: ${player.name} (${Math.round(FREE_AGENT_PICKUP_RATE * 100)}% of £${mv.toLocaleString()} MV)`,
      alwaysLog: true,
    });

    const { error: ue } = await supabase
      .from("players")
      .update({ team_id: team.id })
      .eq("id", player.id);
    if (ue) throw new Error(ue.message);

    return NextResponse.json({
      ok: true,
      playerId: player.id,
      playerName: player.name,
      toTeam: team.name,
      fee,
      marketValue: mv,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Free agency pickup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

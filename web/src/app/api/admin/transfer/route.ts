import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordTeamTransaction } from "@/lib/economyServer";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

/**
 * Admin transfer: move player to buyer club and exchange fee between clubs.
 * Free agent (no club): only the buyer is debited the fee.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      playerId?: string;
      toTeamId?: string;
      fee?: number;
      seasonLabel?: string;
    };

    if (typeof body.playerId !== "string" || !body.playerId.trim()) {
      return NextResponse.json(
        { error: "playerId is required" },
        { status: 400 },
      );
    }
    if (typeof body.toTeamId !== "string" || !body.toTeamId.trim()) {
      return NextResponse.json(
        { error: "toTeamId is required" },
        { status: 400 },
      );
    }

    const fee =
      typeof body.fee === "number" && !Number.isNaN(body.fee) && body.fee >= 0
        ? Math.round(body.fee)
        : NaN;
    if (Number.isNaN(fee)) {
      return NextResponse.json(
        { error: "fee must be a non-negative number" },
        { status: 400 },
      );
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
      .select("id, name, team_id")
      .eq("id", body.playerId.trim())
      .single();
    if (pe || !player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const fromTeamId = player.team_id as string | null;
    if (fromTeamId && fromTeamId === body.toTeamId.trim()) {
      return NextResponse.json(
        { error: "Player is already at this club" },
        { status: 400 },
      );
    }

    const { data: buyer, error: be } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", body.toTeamId.trim())
      .single();
    if (be || !buyer) {
      return NextResponse.json({ error: "Buyer team not found" }, { status: 404 });
    }

    if (fee > 0) {
      if (fromTeamId) {
        await recordTeamTransaction(supabase, {
          teamId: fromTeamId,
          seasonLabel,
          amount: fee,
          category: "transfer_out",
          note: `Sale: ${player.name} → ${buyer.name}`,
        });
      }
      await recordTeamTransaction(supabase, {
        teamId: body.toTeamId.trim(),
        seasonLabel,
        amount: -fee,
        category: "transfer_in",
        note: fromTeamId
          ? `Buy: ${player.name}`
          : `Sign free agent: ${player.name}`,
      });
    }

    const { error: ue } = await supabase
      .from("players")
      .update({ team_id: body.toTeamId.trim() })
      .eq("id", player.id);
    if (ue) throw new Error(ue.message);

    return NextResponse.json({
      ok: true,
      playerId: player.id,
      playerName: player.name,
      fromTeamId,
      toTeamId: body.toTeamId.trim(),
      fee,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Transfer failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

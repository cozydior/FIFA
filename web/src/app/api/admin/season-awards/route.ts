import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Manual Ballon d'Or (ST) and Palm d'Or (GK) per season.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = searchParams.get("season")?.trim();
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("season_player_awards")
      .select("season_label, award_type, player_id, players(id, name, role)");
    if (season) q = q.eq("season_label", season);
    const { data, error } = await q.order("season_label", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ awards: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      seasonLabel?: string;
      ballonPlayerId?: string | null;
      palmPlayerId?: string | null;
    };
    const seasonLabel =
      typeof body.seasonLabel === "string" && body.seasonLabel.trim()
        ? body.seasonLabel.trim()
        : "";
    if (!seasonLabel) {
      return NextResponse.json({ error: "seasonLabel is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (body.ballonPlayerId) {
      const { data: pl, error: e1 } = await supabase
        .from("players")
        .select("id, role")
        .eq("id", body.ballonPlayerId)
        .maybeSingle();
      if (e1 || !pl) {
        return NextResponse.json({ error: "Ballon d'Or player not found" }, { status: 400 });
      }
      if (pl.role !== "ST") {
        return NextResponse.json(
          { error: "Ballon d'Or must be a striker (ST)" },
          { status: 400 },
        );
      }
      const { error: u1 } = await supabase.from("season_player_awards").upsert(
        {
          season_label: seasonLabel,
          award_type: "ballon_dor",
          player_id: body.ballonPlayerId,
        },
        { onConflict: "season_label,award_type" },
      );
      if (u1) throw new Error(u1.message);
    } else {
      await supabase
        .from("season_player_awards")
        .delete()
        .eq("season_label", seasonLabel)
        .eq("award_type", "ballon_dor");
    }

    if (body.palmPlayerId) {
      const { data: pl, error: e2 } = await supabase
        .from("players")
        .select("id, role")
        .eq("id", body.palmPlayerId)
        .maybeSingle();
      if (e2 || !pl) {
        return NextResponse.json({ error: "Palm d'Or player not found" }, { status: 400 });
      }
      if (pl.role !== "GK") {
        return NextResponse.json(
          { error: "Palm d'Or must be a goalkeeper (GK)" },
          { status: 400 },
        );
      }
      const { error: u2 } = await supabase.from("season_player_awards").upsert(
        {
          season_label: seasonLabel,
          award_type: "palm_dor",
          player_id: body.palmPlayerId,
        },
        { onConflict: "season_label,award_type" },
      );
      if (u2) throw new Error(u2.message);
    } else {
      await supabase
        .from("season_player_awards")
        .delete()
        .eq("season_label", seasonLabel)
        .eq("award_type", "palm_dor");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

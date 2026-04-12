import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("players")
      .select(
        "id, name, nationality, role, age, market_value, hidden_ovr, team_id, profile_pic_url, trophies",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.nationality === "string" && body.nationality.trim()) {
      updates.nationality = body.nationality.trim();
    }
    if (body.role === "ST" || body.role === "GK") updates.role = body.role;
    if (
      typeof body.age === "number" &&
      Number.isInteger(body.age) &&
      body.age >= 16 &&
      body.age <= 50
    ) {
      updates.age = body.age;
    }
    if (
      typeof body.market_value === "number" &&
      !Number.isNaN(body.market_value) &&
      body.market_value >= 0
    ) {
      updates.market_value = body.market_value;
      updates.peak_market_value = body.market_value;
    }
    if (typeof body.hidden_ovr === "number" && Number.isInteger(body.hidden_ovr)) {
      const val = Math.max(0, Math.min(100, body.hidden_ovr));
      updates.hidden_ovr = val;
      updates.rating = val;
    }
    if (body.team_id === null || body.team_id === "" || body.team_id === "free") {
      updates.team_id = null;
    } else if (typeof body.team_id === "string") {
      updates.team_id = body.team_id;
    }
    if (body.profile_pic_url === null || typeof body.profile_pic_url === "string") {
      updates.profile_pic_url =
        typeof body.profile_pic_url === "string" && body.profile_pic_url.trim()
          ? body.profile_pic_url.trim()
          : null;
    }
    if (body.trophies !== undefined) {
      if (!Array.isArray(body.trophies)) {
        return NextResponse.json(
          { error: "trophies must be an array" },
          { status: 400 },
        );
      }
      updates.trophies = body.trophies;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("players")
      .update(updates)
      .eq("id", id)
      .select(
        "id, name, nationality, role, age, market_value, hidden_ovr, team_id, profile_pic_url, trophies",
      )
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update player";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

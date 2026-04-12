import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("national_teams")
      .select(
        "id, name, confederation, flag_emoji, team_logo_url, trophies, country_id, countries(name, code)",
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
    if (body.team_logo_url === null || typeof body.team_logo_url === "string") {
      updates.team_logo_url =
        typeof body.team_logo_url === "string" && body.team_logo_url.trim()
          ? body.team_logo_url.trim()
          : null;
    }
    if (body.trophies !== undefined) {
      if (!Array.isArray(body.trophies)) {
        return NextResponse.json({ error: "trophies must be an array" }, { status: 400 });
      }
      updates.trophies = body.trophies;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("national_teams")
      .update(updates)
      .eq("id", id)
      .select("id, name, confederation, flag_emoji, team_logo_url, trophies")
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update national team";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

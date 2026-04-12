import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { code?: string; name?: string; flag_emoji?: string | null };
    const updates: { code?: string; name?: string; flag_emoji?: string | null } = {};

    if (typeof body.code === "string") {
      const code = body.code.trim().toUpperCase();
      if (!code || code.length !== 3) {
        return NextResponse.json(
          { error: "Country code must be exactly 3 letters" },
          { status: 400 },
        );
      }
      updates.code = code;
    }
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "Country name is required" }, { status: 400 });
      }
      updates.name = name;
    }
    if (body.flag_emoji === null) updates.flag_emoji = null;
    if (typeof body.flag_emoji === "string") {
      updates.flag_emoji = body.flag_emoji.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("countries")
      .update(updates)
      .eq("id", id)
      .select("id, code, name, flag_emoji")
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update country";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("countries")
      .select("id, code, name, flag_emoji")
      .order("name");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load countries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { code?: string; name?: string; flag_emoji?: string | null };
    const code = (body.code ?? "").trim().toUpperCase();
    const name = (body.name ?? "").trim();
    const flag_emoji =
      body.flag_emoji === null
        ? null
        : typeof body.flag_emoji === "string" && body.flag_emoji.trim()
          ? body.flag_emoji.trim()
          : null;

    if (!code || code.length !== 3) {
      return NextResponse.json(
        { error: "Country code must be exactly 3 letters" },
        { status: 400 },
      );
    }
    if (!name) {
      return NextResponse.json({ error: "Country name is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("countries")
      .insert({ code, name, flag_emoji })
      .select("id, code, name, flag_emoji")
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create country";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

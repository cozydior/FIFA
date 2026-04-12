import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("seasons")
      .select("id, label, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load seasons";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { label?: string; makeCurrent?: boolean };
    const label = (body.label ?? "").trim();
    if (!label) {
      return NextResponse.json({ error: "label is required" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("seasons")
      .upsert({ label }, { onConflict: "label" })
      .select("id, label")
      .single();
    if (error) throw error;

    if (body.makeCurrent) {
      const { error: se } = await supabase
        .from("app_settings")
        .upsert({ key: "current_season_label", value: label }, { onConflict: "key" });
      if (se) throw new Error(se.message);
    }

    return NextResponse.json({ ...data, madeCurrent: !!body.makeCurrent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create season";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


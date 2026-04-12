import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, country, division, logo_url } = body as Record<
      string,
      unknown
    >;

    const updates: Record<string, string | null> = {};
    if (typeof name === "string") updates.name = name;
    if (typeof country === "string") updates.country = country;
    if (division === "D1" || division === "D2") updates.division = division;
    if (logo_url === null || typeof logo_url === "string")
      updates.logo_url = logo_url ?? null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("leagues")
      .update(updates)
      .eq("id", id)
      .select("id, name, country, division, logo_url")
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update league";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

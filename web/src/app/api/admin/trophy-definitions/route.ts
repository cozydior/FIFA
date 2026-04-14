import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCabinetScope } from "@/lib/trophyCabinetScope";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("trophy_definitions")
      .select("id, slug, name, icon_url, sort_order, cabinet_scope")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      slug?: string;
      name?: string;
      icon_url?: string | null;
      sort_order?: number;
      cabinet_scope?: string | null;
    };
    if (typeof body.slug !== "string" || !body.slug.trim()) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const slug = body.slug.trim().toLowerCase().replace(/\s+/g, "_");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("trophy_definitions")
      .insert({
        slug,
        name: body.name.trim(),
        icon_url:
          typeof body.icon_url === "string" && body.icon_url.trim()
            ? body.icon_url.trim()
            : null,
        sort_order:
          typeof body.sort_order === "number" && !Number.isNaN(body.sort_order)
            ? body.sort_order
            : 0,
        cabinet_scope: normalizeCabinetScope(body.cabinet_scope),
      })
      .select("id, slug, name, icon_url, sort_order, cabinet_scope")
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

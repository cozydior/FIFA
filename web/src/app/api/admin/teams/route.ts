import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_BUDGET = 5_000_000;

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, logo_url, current_balance")
      .order("name");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      logo_url,
      country,
      league_id,
      budget,
      current_balance,
      trophies,
    } = body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof country !== "string" || !country.trim()) {
      return NextResponse.json(
        { error: "country is required" },
        { status: 400 },
      );
    }

    const budgetNum =
      typeof budget === "number" && !Number.isNaN(budget)
        ? budget
        : DEFAULT_BUDGET;
    const balanceNum =
      typeof current_balance === "number" && !Number.isNaN(current_balance)
        ? current_balance
        : budgetNum;

    const leagueId =
      league_id === null || league_id === ""
        ? null
        : typeof league_id === "string"
          ? league_id
          : null;

    const row = {
      name: name.trim(),
      logo_url:
        typeof logo_url === "string" && logo_url.trim()
          ? logo_url.trim()
          : null,
      country: country.trim(),
      league_id: leagueId,
      budget: budgetNum,
      current_balance: balanceNum,
      trophies: Array.isArray(trophies) ? trophies : [],
    };

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("teams")
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create team";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

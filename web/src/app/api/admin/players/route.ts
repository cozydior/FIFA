import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("players")
      .select(
        "id, name, nationality, role, age, hidden_ovr, team_id, market_value, profile_pic_url, career_salary_earned, trophies",
      )
      .order("name");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load players";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      nationality,
      role,
      rating,
      hidden_ovr,
      age,
      market_value,
      profile_pic_url,
      team_id,
    } = body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof nationality !== "string" || !nationality.trim()) {
      return NextResponse.json(
        { error: "nationality is required" },
        { status: 400 },
      );
    }
    if (role !== "ST" && role !== "GK") {
      return NextResponse.json(
        { error: "role must be ST or GK" },
        { status: 400 },
      );
    }

    const hiddenRaw =
      hidden_ovr !== undefined
        ? hidden_ovr
        : rating !== undefined
          ? rating
          : 50;
    const hiddenNum =
      typeof hiddenRaw === "number" && Number.isInteger(hiddenRaw)
        ? hiddenRaw
        : typeof hiddenRaw === "string"
          ? parseInt(hiddenRaw, 10)
          : NaN;
    if (Number.isNaN(hiddenNum) || hiddenNum < 0 || hiddenNum > 100) {
      return NextResponse.json(
        { error: "hidden_ovr must be an integer 0–100" },
        { status: 400 },
      );
    }

    const ageNum =
      typeof age === "number" && Number.isInteger(age)
        ? age
        : typeof age === "string"
          ? parseInt(age, 10)
          : 24;
    if (Number.isNaN(ageNum) || ageNum < 16 || ageNum > 50) {
      return NextResponse.json(
        { error: "age must be an integer 16–50" },
        { status: 400 },
      );
    }

    const marketNum =
      typeof market_value === "number" && !Number.isNaN(market_value)
        ? market_value
        : typeof market_value === "string"
          ? parseFloat(market_value)
          : 0;

    const teamId =
      team_id === null || team_id === "" || team_id === "free"
        ? null
        : typeof team_id === "string"
          ? team_id
          : null;

    const row = {
      name: name.trim(),
      nationality: nationality.trim(),
      role,
      rating: hiddenNum,
      hidden_ovr: hiddenNum,
      age: ageNum,
      market_value: marketNum,
      peak_market_value: marketNum,
      profile_pic_url:
        typeof profile_pic_url === "string" && profile_pic_url.trim()
          ? profile_pic_url.trim()
          : null,
      team_id: teamId,
    };

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("players")
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create player";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

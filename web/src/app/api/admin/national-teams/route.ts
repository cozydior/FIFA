import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("national_teams")
      .select("id, name, confederation, flag_emoji, countries(name, code)")
      .order("confederation")
      .order("name");
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load national teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Seed/update one national team per country (country != league). */
export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const seed = [
      { code: "ENG", name: "England", confederation: "UEFA", flag_emoji: "🏴" },
      { code: "ESP", name: "Spain", confederation: "UEFA", flag_emoji: "🇪🇸" },
      { code: "FRA", name: "France", confederation: "UEFA", flag_emoji: "🇫🇷" },
      { code: "GER", name: "Germany", confederation: "UEFA", flag_emoji: "🇩🇪" },
      { code: "GRE", name: "Greece", confederation: "UEFA", flag_emoji: "🇬🇷" },
      { code: "DEN", name: "Denmark", confederation: "UEFA", flag_emoji: "🇩🇰" },
      { code: "AUS", name: "Australia", confederation: "FIFA", flag_emoji: "🇦🇺" },
      { code: "KOR", name: "South Korea", confederation: "FIFA", flag_emoji: "🇰🇷" },
      { code: "NGA", name: "Nigeria", confederation: "FIFA", flag_emoji: "🇳🇬" },
      { code: "ISR", name: "Israel", confederation: "FIFA", flag_emoji: "🇮🇱" },
      { code: "CAN", name: "Canada", confederation: "FIFA", flag_emoji: "🇨🇦" },
      { code: "USA", name: "USA", confederation: "FIFA", flag_emoji: "🇺🇸" },
    ] as const;

    for (const c of seed) {
      const { error } = await supabase
        .from("countries")
        .upsert(
          { code: c.code, name: c.name, flag_emoji: c.flag_emoji },
          { onConflict: "code" },
        );
      if (error) throw new Error(error.message);
    }

    const { data: countries, error: ce } = await supabase
      .from("countries")
      .select("id, code, name, flag_emoji")
      .in("code", seed.map((s) => s.code));
    if (ce) throw new Error(ce.message);

    const byCode = new Map((countries ?? []).map((c) => [c.code, c]));
    const rows = seed
      .map((s) => {
        const c = byCode.get(s.code);
        if (!c) return null;
        return {
          country_id: c.id,
          name: c.name,
          confederation: s.confederation,
          flag_emoji: c.flag_emoji ?? s.flag_emoji,
        };
      })
      .filter(Boolean);

    if (rows.length > 0) {
      const { error: ie } = await supabase
        .from("national_teams")
        .upsert(rows, { onConflict: "country_id" });
      if (ie) throw new Error(ie.message);
    }

    return NextResponse.json({ ok: true, createdOrUpdated: rows.length, countriesSeeded: seed.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to seed national teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


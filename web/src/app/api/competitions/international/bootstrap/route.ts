import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  bootstrapInternationalForSeason,
  bootstrapInternationalForSlug,
} from "@/lib/international";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";
import {
  canBootstrapNationsLeagueOrGoldCup,
  canDrawWorldCupGroups,
} from "@/lib/tournamentGates";
import { getTournamentsMode } from "@/lib/appSettings";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      seasonLabel?: string;
      slug?: "nations_league" | "gold_cup" | "world_cup";
      /** When true, run legacy all-in-one bootstrap (Admin). */
      all?: boolean;
    };
    const seasonLabel =
      typeof body.seasonLabel === "string" && body.seasonLabel.trim()
        ? body.seasonLabel.trim()
        : await getCurrentSeasonLabel();
    if (!seasonLabel) {
      return NextResponse.json(
        { error: "No season selected. Create/set a current season in Admin." },
        { status: 400 },
      );
    }
    const supabase = getSupabaseAdmin();

    if (body.all === true) {
      const result = await bootstrapInternationalForSeason(supabase, seasonLabel);
      return NextResponse.json({ seasonLabel, ...result });
    }

    const slug = body.slug;
    if (!slug) {
      return NextResponse.json(
        { error: "Pass { slug: \"nations_league\" | \"gold_cup\" | \"world_cup\" } or { all: true }." },
        { status: 400 },
      );
    }

    if (slug === "nations_league" || slug === "gold_cup") {
      const tournamentsOn = await getTournamentsMode();
      if (!tournamentsOn) {
        return NextResponse.json(
          {
            error:
              "Turn on Tournaments mode in Admin → Season to generate Nations League or Gold Cup.",
          },
          { status: 403 },
        );
      }
      const gate = await canBootstrapNationsLeagueOrGoldCup(supabase, seasonLabel);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.reason ?? "Requirements not met" }, { status: 403 });
      }
    } else if (slug === "world_cup") {
      const gate = await canDrawWorldCupGroups(supabase, seasonLabel);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.reason ?? "Requirements not met" }, { status: 403 });
      }
    }

    const result = await bootstrapInternationalForSlug(supabase, seasonLabel, slug);
    return NextResponse.json({ seasonLabel, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bootstrap failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


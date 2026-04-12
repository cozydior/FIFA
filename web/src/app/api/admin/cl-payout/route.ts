import { NextResponse } from "next/server";
import { applyChampionsLeaguePayouts } from "@/lib/seasonEconomy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentSeasonLabel } from "@/lib/seasonSettings";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      seasonLabel?: string;
      winnerTeamId?: string;
      runnerUpTeamId?: string;
      semiLoserTeamIds?: string[];
      quarterFinalistTeamIds?: string[];
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

    if (typeof body.winnerTeamId !== "string" || !body.winnerTeamId.trim()) {
      return NextResponse.json(
        { error: "winnerTeamId is required" },
        { status: 400 },
      );
    }
    if (typeof body.runnerUpTeamId !== "string" || !body.runnerUpTeamId.trim()) {
      return NextResponse.json(
        { error: "runnerUpTeamId is required" },
        { status: 400 },
      );
    }
    if (body.winnerTeamId === body.runnerUpTeamId) {
      return NextResponse.json(
        { error: "winner and runner-up must be different teams" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const result = await applyChampionsLeaguePayouts(supabase, seasonLabel, {
      winnerTeamId: body.winnerTeamId.trim(),
      runnerUpTeamId: body.runnerUpTeamId.trim(),
      semiLoserTeamIds: Array.isArray(body.semiLoserTeamIds)
        ? body.semiLoserTeamIds.filter((x) => typeof x === "string" && x.trim())
        : undefined,
      quarterFinalistTeamIds: Array.isArray(body.quarterFinalistTeamIds)
        ? body.quarterFinalistTeamIds.filter(
            (x) => typeof x === "string" && x.trim(),
          )
        : undefined,
    });

    return NextResponse.json({ seasonLabel, ...result });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "CL payout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

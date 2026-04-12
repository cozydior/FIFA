import { NextResponse } from "next/server";
import { buildSeasonMasterFromDatabase } from "@/lib/seasonMasterData";

export async function GET() {
  try {
    const { schedule, warnings } = await buildSeasonMasterFromDatabase();

    return NextResponse.json({
      schedule,
      warnings,
      leagueCount: new Set(
        schedule
          .filter((r) => r.competition === "league")
          .map((r) => r.leagueId),
      ).size,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

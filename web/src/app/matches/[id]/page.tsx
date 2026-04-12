import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { flagEmojiByNationalityNames } from "@/lib/nationalityFlags";
import { MatchReportView } from "@/components/match/MatchReportView";
import type { ShotEvent } from "@/lib/simEngine";
import type { SetupPlayer } from "@/components/match/MatchFeedCards";

export const revalidate = 60;

export default async function SavedMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("saved_sim_matches")
    .select(
      "id, season_label, home_team_id, away_team_id, home_score, away_score, shots, lineups, player_results, score_breakdown",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  const shots = (row.shots ?? []) as ShotEvent[];
  const lineups = row.lineups as {
    home: {
      id: string;
      name: string;
      logoUrl: string | null;
      players: SetupPlayer[];
    };
    away: {
      id: string;
      name: string;
      logoUrl: string | null;
      players: SetupPlayer[];
    };
  };
  const playerResults = (row.player_results ?? []) as { id: string; fotMob: number }[];
  const breakdown = row.score_breakdown as { displayLine?: string } | null;
  const scoreLine = typeof breakdown?.displayLine === "string" ? breakdown.displayLine : null;

  if (!lineups?.home?.players || !lineups?.away?.players) {
    notFound();
  }

  const flagByNat = await flagEmojiByNationalityNames(
    supabase,
    [...lineups.home.players, ...lineups.away.players].map((p) => p.nationality),
  );
  const enrich = (players: typeof lineups.home.players) =>
    players.map((p) => ({
      ...p,
      flag_emoji: flagByNat.get(p.nationality) ?? null,
    }));
  const lineupsWithFlags = {
    home: { ...lineups.home, players: enrich(lineups.home.players) },
    away: { ...lineups.away, players: enrich(lineups.away.players) },
  };

  return (
    <div className="min-h-screen bg-slate-50/90">
      <div className="border-b border-slate-200 bg-white/90 px-4 py-3 text-center text-sm text-slate-600">
        <Link href="/dashboard" className="font-semibold text-emerald-700 hover:underline">
          ← Dashboard
        </Link>
      </div>
      <MatchReportView
        seasonLabel={row.season_label}
        homeScore={row.home_score}
        awayScore={row.away_score}
        shots={shots}
        lineups={lineupsWithFlags}
        playerResults={playerResults}
        scoreLine={scoreLine}
      />
    </div>
  );
}

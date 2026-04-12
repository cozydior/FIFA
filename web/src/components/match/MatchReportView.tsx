"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import {
  PlayerColumn,
  ShotFeedCard,
  TeamLogo,
  type SetupPlayer,
} from "@/components/match/MatchFeedCards";
import type { ShotEvent } from "@/lib/simEngine";
import { AetScoreLine } from "@/components/AetScoreLine";

type Lineups = {
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

export function MatchReportView({
  seasonLabel,
  homeScore,
  awayScore,
  shots,
  lineups,
  playerResults,
  scoreLine,
}: {
  seasonLabel: string;
  homeScore: number;
  awayScore: number;
  shots: ShotEvent[];
  lineups: Lineups;
  playerResults: { id: string; fotMob: number }[];
  /** Knockout rich score, e.g. `1-1 AET (2-1)` */
  scoreLine?: string | null;
}) {
  const teamNames: Record<string, string> = {
    [lineups.home.id]: lineups.home.name,
    [lineups.away.id]: lineups.away.name,
  };
  const playerNames: Record<string, string> = {};
  const playerPics: Record<string, string | null> = {};
  for (const p of [...lineups.home.players, ...lineups.away.players]) {
    playerNames[p.id] = p.name;
    playerPics[p.id] = p.profile_pic_url;
  }
  const teamLogos: Record<string, string | null> = {
    [lineups.home.id]: lineups.home.logoUrl,
    [lineups.away.id]: lineups.away.logoUrl,
  };
  const fotMobById: Record<string, number> = {};
  for (const r of playerResults) {
    fotMobById[r.id] = r.fotMob;
  }

  const playerFlags: Record<string, string | null | undefined> = {};
  for (const p of [...lineups.home.players, ...lineups.away.players]) {
    if (p.flag_emoji) playerFlags[p.id] = p.flag_emoji;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="text-center">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500">
          Saved match report
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
          {lineups.home.name} vs {lineups.away.name}
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{seasonLabel}</p>
        <p className="mt-3">
          <Link
            href={`/matchday?homeTeamId=${lineups.home.id}&awayTeamId=${lineups.away.id}`}
            className="text-sm font-semibold text-emerald-700 hover:underline"
          >
            Open live match center (new sim) →
          </Link>
        </p>
      </header>

      <div className="relative overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-lg ring-1 ring-slate-200/80">
        <div className="bg-pitch-stripes border-b border-emerald-900/10 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-1 flex-col items-center gap-2 text-center">
              <TeamLogo url={lineups.home.logoUrl} name={lineups.home.name} />
              <span className="max-w-[8rem] text-sm font-bold leading-tight text-slate-900 sm:max-w-none">
                {lineups.home.name}
              </span>
            </div>
            <div className="flex flex-col items-center px-2">
              <span className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">
                Final score
              </span>
              <div className="mt-1 flex items-baseline gap-2 text-4xl font-black tabular-nums text-slate-900 sm:text-5xl">
                <span>{homeScore}</span>
                <span className="text-2xl font-bold text-slate-400">:</span>
                <span>{awayScore}</span>
              </div>
              <AetScoreLine line={scoreLine} className="justify-center" />
            </div>
            <div className="flex flex-1 flex-col items-center gap-2 text-center">
              <TeamLogo url={lineups.away.logoUrl} name={lineups.away.name} />
              <span className="max-w-[8rem] text-sm font-bold leading-tight text-slate-900 sm:max-w-none">
                {lineups.away.name}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:gap-6 sm:p-6">
          <PlayerColumn
            title={lineups.home.name}
            players={lineups.home.players}
            fotMobById={fotMobById}
            showFotMob
            shotsLog={shots}
          />
          <PlayerColumn
            title={lineups.away.name}
            players={lineups.away.players}
            fotMobById={fotMobById}
            showFotMob
            shotsLog={shots}
          />
        </div>
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-slate-100 px-4 pb-4 pt-3 text-center text-[0.7rem] leading-relaxed text-slate-600 sm:px-5">
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-emerald-400/50">
              <Check className="h-3 w-3 stroke-[3]" />
            </span>
            goal / save
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white ring-1 ring-red-400/50">
              <X className="h-3 w-3 stroke-[3]" />
            </span>
            saved (ST) / conceded (GK)
          </span>
          <span className="w-full text-slate-500 sm:w-auto">— order matches shots.</span>
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-300/90 bg-white shadow-md ring-1 ring-slate-200/60">
        <h2 className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600">
          Shot-by-shot feed
        </h2>
        <ul className="max-h-[min(28rem,70vh)] space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          {shots.map((shot, i) => (
            <li key={i}>
              <ShotFeedCard
                shot={shot}
                teamNames={teamNames}
                playerNames={playerNames}
                teamLogos={teamLogos}
                playerPics={playerPics}
                playerFlags={playerFlags}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

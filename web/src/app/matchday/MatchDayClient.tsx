"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import {
  PlayerColumn,
  ShotFeedCard,
  TeamLogo,
  type SetupPlayer,
} from "@/components/match/MatchFeedCards";
import {
  finalizeLiveMatch,
  initLiveMatch,
  isLiveMatchComplete,
  runRemainingLiveShots,
  stepLiveMatchRound,
  stepLiveMatchShot,
  type LiveMatchState,
  type MatchSimulationResult,
  type ShotEvent,
  type SimTeam,
} from "@/lib/simEngine";

type SetupPayload = {
  matchKind?: "club" | "international";
  internationalFixtureId?: string;
  competitionSlug?: string;
  /** Extra-time + sudden death when true (knockout fixtures only). */
  knockout?: boolean;
  seasonLabel: string;
  home: {
    id: string;
    name: string;
    logoUrl: string | null;
    flagEmoji?: string | null;
    /** International: link to /countries/[code] */
    countryCode?: string | null;
    players: SetupPlayer[];
  };
  away: {
    id: string;
    name: string;
    logoUrl: string | null;
    flagEmoji?: string | null;
    countryCode?: string | null;
    players: SetupPlayer[];
  };
  simHome: SimTeam;
  simAway: SimTeam;
};

type FeedEntry =
  | { id: string; kind: "intro"; text: string }
  | { id: string; kind: "shot"; shot: ShotEvent };

function feedId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function MatchDayClient() {
  const searchParams = useSearchParams();
  const intlFixtureId = searchParams.get("intlFixtureId");
  const homeTeamId = searchParams.get("homeTeamId");
  const awayTeamId = searchParams.get("awayTeamId");
  const fixtureId = searchParams.get("fixtureId");

  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveMatchState | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const feedScrollRef = useRef<HTMLUListElement>(null);
  const [finalResult, setFinalResult] = useState<MatchSimulationResult | null>(
    null,
  );
  const [persistError, setPersistError] = useState<string | null>(null);
  const [persistOk, setPersistOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const persistedRef = useRef(false);

  const nameById = useRef<Record<string, string>>({});
  const teamNameById = useRef<Record<string, string>>({});
  const profilePicById = useRef<Record<string, string | null>>({});
  const teamLogoById = useRef<Record<string, string | null>>({});

  const pushEtIntroIfNeeded = useCallback(
    (stateBefore: LiveMatchState) => {
      if (!setup?.knockout) return;
      if (stateBefore.shotIndex !== 8) return;
      const h = stateBefore.goalsByTeamId[setup.home.id] ?? 0;
      const a = stateBefore.goalsByTeamId[setup.away.id] ?? 0;
      if (h !== a) return;
      setFeed((f) => [
        ...f,
        {
          id: feedId(),
          kind: "intro",
          text: "Extra time — four-shot periods until a winner; sudden death if still level after extra time.",
        },
      ]);
    },
    [setup],
  );

  const resetFromSetup = useCallback((data: SetupPayload) => {
    const names: Record<string, string> = {};
    for (const p of [...data.home.players, ...data.away.players]) {
      names[p.id] = p.name;
    }
    nameById.current = names;
    const pics: Record<string, string | null> = {};
    for (const p of [...data.home.players, ...data.away.players]) {
      pics[p.id] = p.profile_pic_url;
    }
    profilePicById.current = pics;
    teamNameById.current = {
      [data.home.id]: data.home.name,
      [data.away.id]: data.away.name,
    };
    teamLogoById.current = {
      [data.home.id]: data.home.logoUrl,
      [data.away.id]: data.away.logoUrl,
    };
    setLive(
      initLiveMatch(data.simHome, data.simAway, {
        knockout: Boolean(data.knockout),
      }),
    );
    const introText =
      data.matchKind === "international" ?
        "Kickoff — international fixture. Same live shot-by-shot sim as club Matchday (call-up lineups)."
      : "Kickoff — shots alternate home then away; each team’s best ST shoots before their second ST.";
    setFeed([
      {
        id: feedId(),
        kind: "intro",
        text: introText,
      },
    ]);
    setFinalResult(null);
    setPersistError(null);
    setPersistOk(false);
    setSavedMatchId(null);
    persistedRef.current = false;
  }, []);

  useEffect(() => {
    if (!intlFixtureId && (!homeTeamId || !awayTeamId)) {
      setLoadError(
        "Add an international fixture id, or two club team ids, in the URL query string.",
      );
      setSetup(null);
      setLive(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const url =
          intlFixtureId ?
            `/api/matchday/setup?intlFixtureId=${encodeURIComponent(intlFixtureId)}`
          : `/api/matchday/setup?homeTeamId=${encodeURIComponent(homeTeamId!)}&awayTeamId=${encodeURIComponent(awayTeamId!)}${
              fixtureId ? `&fixtureId=${encodeURIComponent(fixtureId)}` : ""
            }`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load match");
        if (cancelled) return;
        setSetup(data as SetupPayload);
        resetFromSetup(data as SetupPayload);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Load failed");
          setSetup(null);
          setLive(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intlFixtureId, homeTeamId, awayTeamId, fixtureId, resetFromSetup]);

  useEffect(() => {
    const el = feedScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [feed.length]);

  const persistIfNeeded = useCallback(
    async (result: MatchSimulationResult) => {
      if (!setup || persistedRef.current) return;
      persistedRef.current = true;
      setSaving(true);
      setPersistError(null);
      try {
        const savedMatchSnapshot = {
          shots: result.shots,
          scoreBreakdown: result.scoreBreakdown,
          lineups: {
            home: {
              id: setup.home.id,
              name: setup.home.name,
              logoUrl: setup.home.logoUrl,
              players: setup.home.players,
            },
            away: {
              id: setup.away.id,
              name: setup.away.name,
              logoUrl: setup.away.logoUrl,
              players: setup.away.players,
            },
          },
          playerResults: result.players.map((p) => ({
            id: p.id,
            fotMob: p.fotMob,
            goals: p.goals ?? 0,
            saves: p.saves ?? 0,
          })),
        };
        const isIntl = setup.matchKind === "international";
        const res = await fetch("/api/matchday/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchKind: setup.matchKind ?? "club",
            internationalFixtureId: isIntl ? setup.internationalFixtureId : undefined,
            seasonLabel: setup.seasonLabel,
            homeTeamId: setup.home.id,
            awayTeamId: setup.away.id,
            homeScore: result.goalsByTeamId[setup.home.id] ?? 0,
            awayScore: result.goalsByTeamId[setup.away.id] ?? 0,
            fixtureId: isIntl ? null : fixtureId || null,
            scoreBreakdown: result.scoreBreakdown,
            fullPlayerResults: isIntl ? result.players : undefined,
            players: result.players.map((p) => ({
              id: p.id,
              hiddenOvrAfter: p.ratingAfter,
              fotMob: p.fotMob,
              goals: p.goals ?? 0,
              saves: p.saves ?? 0,
            })),
            savedMatchSnapshot: isIntl ? undefined : savedMatchSnapshot,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
        setPersistOk(true);
        if (typeof data.savedMatchId === "string") {
          setSavedMatchId(data.savedMatchId);
        }
      } catch (e) {
        persistedRef.current = false;
        setPersistError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [setup, fixtureId],
  );

  const finishIfDone = useCallback(
    (state: LiveMatchState) => {
      if (!isLiveMatchComplete(state)) return;
      const result = finalizeLiveMatch(state);
      setFinalResult(result);
      void persistIfNeeded(result);
    },
    [persistIfNeeded],
  );

  const appendShots = useCallback((shots: ShotEvent[]) => {
    if (shots.length === 0) return;
    setFeed((f) => [
      ...f,
      ...shots.map((shot) => ({
        id: feedId(),
        kind: "shot" as const,
        shot,
      })),
    ]);
  }, []);

  const simGoal = useCallback(() => {
    if (!live || finalResult) return;
    if (isLiveMatchComplete(live)) return;
    try {
      pushEtIntroIfNeeded(live);
      const { nextState, shot } = stepLiveMatchShot(live);
      setLive(nextState);
      appendShots([shot]);
      finishIfDone(nextState);
    } catch {
      /* full time */
    }
  }, [live, finalResult, appendShots, finishIfDone, pushEtIntroIfNeeded]);

  const simRound = useCallback(() => {
    if (!live || finalResult) return;
    if (isLiveMatchComplete(live)) return;
    try {
      pushEtIntroIfNeeded(live);
      const { nextState, shots } = stepLiveMatchRound(live);
      setLive(nextState);
      appendShots(shots);
      finishIfDone(nextState);
    } catch {
      /* */
    }
  }, [live, finalResult, appendShots, finishIfDone, pushEtIntroIfNeeded]);

  const simGame = useCallback(() => {
    if (!live || finalResult) return;
    if (isLiveMatchComplete(live)) return;
    try {
      pushEtIntroIfNeeded(live);
      const { nextState, shots } = runRemainingLiveShots(live);
      setLive(nextState);
      appendShots(shots);
      finishIfDone(nextState);
    } catch {
      /* */
    }
  }, [live, finalResult, appendShots, finishIfDone, pushEtIntroIfNeeded]);

  const playerFlags = useMemo(() => {
    if (!setup) return undefined as Record<string, string | null | undefined> | undefined;
    const m: Record<string, string | null> = {};
    for (const p of [...setup.home.players, ...setup.away.players]) {
      m[p.id] = p.flag_emoji ?? null;
    }
    return m;
  }, [setup]);

  const matchOver = Boolean(finalResult);
  const homeScore =
    live && setup ? (live.goalsByTeamId[setup.home.id] ?? 0) : 0;
  const awayScore =
    live && setup ? (live.goalsByTeamId[setup.away.id] ?? 0) : 0;

  const fotMobById: Record<string, number> = {};
  if (finalResult) {
    for (const p of finalResult.players) {
      fotMobById[p.id] = p.fotMob;
    }
  }

  if (!intlFixtureId && (!homeTeamId || !awayTeamId)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-300 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Match center</h1>
          <p className="mt-2 text-sm text-slate-600">
            Open a club fixture from Dashboard <strong>Next up</strong>, or an international tie with{" "}
            <strong>intlFixtureId</strong> (same interactive sim for both).
          </p>
          <code className="mt-4 block rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
            /matchday?homeTeamId=…&awayTeamId=…&fixtureId=…
          </code>
          <code className="mt-2 block rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
            /matchday?intlFixtureId=…
          </code>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      </div>
    );
  }

  if (!setup || !live) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-4 shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
          <span className="text-sm font-semibold text-slate-700">
            Loading match…
          </span>
        </div>
      </div>
    );
  }

  const homeTeamHref: string | null =
    setup.matchKind === "international" ?
      setup.home.countryCode ? `/countries/${setup.home.countryCode}` : null
    : `/team/${setup.home.id}`;
  const awayTeamHref: string | null =
    setup.matchKind === "international" ?
      setup.away.countryCode ? `/countries/${setup.away.countryCode}` : null
    : `/team/${setup.away.id}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="text-center">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-700">
          Live simulation
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
          Match center
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {setup.seasonLabel}
          {setup.matchKind === "international" && setup.competitionSlug ?
            <span className="ml-2 text-indigo-700">
              · {setup.competitionSlug.replace(/_/g, " ")}
            </span>
          : null}
        </p>
      </header>

      {matchOver && (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-950">
          {saving && <p>Saving stats & scores…</p>}
          {persistOk && <p>Full time — saved to database.</p>}
          {persistOk && savedMatchId && (
            <p>
              <Link
                href={`/matches/${savedMatchId}`}
                className="font-bold text-emerald-800 underline decoration-emerald-400 underline-offset-2 hover:text-emerald-950"
              >
                View saved match report →
              </Link>
            </p>
          )}
          {persistError && (
            <p className="text-red-700">{persistError}</p>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-lg ring-1 ring-slate-200/80 transition-shadow duration-500 hover:shadow-xl">
        <div className="bg-pitch-stripes border-b border-emerald-900/10 px-3 py-5 sm:px-8">
          <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-6">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center transition-transform duration-300">
              <TeamLogo
                url={setup.home.logoUrl}
                name={setup.home.name}
                emoji={setup.home.flagEmoji}
              />
              {homeTeamHref ?
                <Link
                  href={homeTeamHref}
                  className="w-full min-w-0 px-1 text-sm font-bold leading-snug text-slate-900 hover:text-emerald-800 hover:underline"
                >
                  <span className="break-words">{setup.home.name}</span>
                </Link>
              : <span className="w-full min-w-0 px-1 text-sm font-bold leading-snug text-slate-900">
                  <span className="break-words">{setup.home.name}</span>
                </span>}
            </div>
            <div className="flex shrink-0 flex-col items-center px-1 sm:px-3">
              <span className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">
                Score
              </span>
              <div
                key={`${homeScore}-${awayScore}`}
                className="animate-score-pop mt-1 flex items-baseline gap-2 text-4xl font-black tabular-nums tracking-tight text-slate-900 sm:text-5xl"
              >
                <span className="transition-colors duration-300">{homeScore}</span>
                <span className="text-2xl font-bold text-slate-400">:</span>
                <span className="transition-colors duration-300">{awayScore}</span>
              </div>
              {matchOver && finalResult?.scoreBreakdown?.displayLine ?
                <p className="mt-2 max-w-[18rem] text-center font-mono text-[0.7rem] font-semibold leading-snug text-slate-600 sm:max-w-none">
                  {finalResult.scoreBreakdown.displayLine}
                </p>
              : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center transition-transform duration-300">
              <TeamLogo
                url={setup.away.logoUrl}
                name={setup.away.name}
                emoji={setup.away.flagEmoji}
              />
              {awayTeamHref ?
                <Link
                  href={awayTeamHref}
                  className="w-full min-w-0 px-1 text-sm font-bold leading-snug text-slate-900 hover:text-emerald-800 hover:underline"
                >
                  <span className="break-words">{setup.away.name}</span>
                </Link>
              : <span className="w-full min-w-0 px-1 text-sm font-bold leading-snug text-slate-900">
                  <span className="break-words">{setup.away.name}</span>
                </span>}
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:gap-8 sm:p-6">
          <PlayerColumn
            title={
              homeTeamHref ?
                <Link href={homeTeamHref} className="hover:text-emerald-800 hover:underline">
                  {setup.home.name}
                </Link>
              : setup.home.name
            }
            players={setup.home.players}
            fotMobById={fotMobById}
            showFotMob={matchOver}
            shotsLog={live.shotsLog}
          />
          <PlayerColumn
            title={
              awayTeamHref ?
                <Link href={awayTeamHref} className="hover:text-emerald-800 hover:underline">
                  {setup.away.name}
                </Link>
              : setup.away.name
            }
            players={setup.away.players}
            fotMobById={fotMobById}
            showFotMob={matchOver}
            shotsLog={live.shotsLog}
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
          <span className="w-full text-slate-500 sm:w-auto">— order matches shots left-to-right.</span>
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={simGoal}
          disabled={matchOver}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-md transition duration-200 ease-out hover:bg-slate-800 hover:shadow-lg active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35"
        >
          Sim goal
        </button>
        <button
          type="button"
          onClick={simRound}
          disabled={matchOver}
          className="rounded-xl border-2 border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow-sm transition duration-200 ease-out hover:border-emerald-400/80 hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35"
        >
          Sim round
        </button>
        <button
          type="button"
          onClick={simGame}
          disabled={matchOver}
          className="rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-md ring-1 ring-emerald-800/30 transition duration-200 ease-out hover:from-emerald-500 hover:to-emerald-600 hover:shadow-lg active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35"
        >
          Sim full match
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-300/90 bg-white shadow-md ring-1 ring-slate-200/60 transition-shadow duration-300 hover:shadow-lg">
        <h2 className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600">
          Match feed
        </h2>
        <ul
          ref={feedScrollRef}
          className="max-h-[min(28rem,70vh)] space-y-4 overflow-y-auto overscroll-contain px-4 py-4 scroll-smooth"
        >
          {feed.map((entry) =>
            entry.kind === "intro" ?
              <li
                key={entry.id}
                className="animate-match-feed-in rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2.5 text-sm leading-relaxed text-slate-700"
              >
                {entry.text}
              </li>
            : <li key={entry.id}>
                <ShotFeedCard
                  shot={entry.shot}
                  teamNames={teamNameById.current}
                  playerNames={nameById.current}
                  teamLogos={teamLogoById.current}
                  playerPics={profilePicById.current}
                  playerFlags={playerFlags}
                />
              </li>,
          )}
        </ul>
      </section>

    </div>
  );
}

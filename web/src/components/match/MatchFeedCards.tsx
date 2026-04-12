"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { formatShotFeedLine, type ShotEvent } from "@/lib/simEngine";
import { PlayerAvatar } from "@/components/PlayerAvatar";

export type SetupPlayer = {
  id: string;
  name: string;
  nationality: string;
  role: string;
  rating: number;
  profile_pic_url: string | null;
  /** From `countries.flag_emoji` via nationality name */
  flag_emoji?: string | null;
};

export function fotMobBadgeClass(v: number): string {
  if (v >= 9) return "bg-blue-600 text-white shadow-sm";
  if (v >= 7) return "bg-emerald-600 text-white shadow-sm";
  if (v >= 5) return "bg-orange-500 text-white shadow-sm";
  return "bg-red-600 text-white shadow-sm";
}

function ShotRoundel({
  ok,
  title,
}: {
  ok: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm ring-2 ${
        ok ?
          "bg-emerald-500 text-white ring-emerald-400/50"
        : "bg-red-500 text-white ring-red-400/50"
      }`}
    >
      {ok ?
        <Check className="h-3.5 w-3.5 stroke-[2.8]" strokeLinecap="round" strokeLinejoin="round" />
      : <X className="h-3.5 w-3.5 stroke-[2.8]" strokeLinecap="round" strokeLinejoin="round" />}
    </span>
  );
}

export function PlayerShootingLine({
  shotsLog,
  playerId,
  role,
}: {
  shotsLog: ShotEvent[];
  playerId: string;
  role: string;
}) {
  if (role === "ST") {
    const bits = shotsLog.filter((s) => s.strikerId === playerId);
    if (bits.length === 0) return null;
    return (
      <span className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Shots in order">
        {bits.map((s, i) => (
          <ShotRoundel
            key={i}
            ok={s.goal}
            title={s.goal ? "Goal" : "Saved by keeper"}
          />
        ))}
      </span>
    );
  }
  if (role === "GK") {
    const bits = shotsLog.filter((s) => s.goalkeeperId === playerId);
    if (bits.length === 0) return null;
    return (
      <span className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Saves and goals faced in order">
        {bits.map((s, i) => (
          <ShotRoundel
            key={i}
            ok={!s.goal}
            title={s.goal ? "Goal conceded" : "Save"}
          />
        ))}
      </span>
    );
  }
  return null;
}

function OutcomeBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-md ring-2 transition-transform duration-300 ease-out ${
        ok
          ? "bg-emerald-500 text-white ring-emerald-400/40"
          : "bg-red-500 text-white ring-red-400/40"
      }`}
    >
      {ok ?
        <Check className="h-5 w-5 stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round" />
      : <X className="h-5 w-5 stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round" />}
    </span>
  );
}

function FeedTeamLogo({
  url,
  name,
  sizeClassName,
}: {
  url: string | null;
  name: string;
  sizeClassName: string;
}) {
  const [ok, setOk] = useState(Boolean(url));
  if (!url || !ok) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 font-bold text-slate-600 ring-1 ring-slate-200/80 ${sizeClassName}`}
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={`shrink-0 rounded-xl border border-slate-200/90 object-contain shadow-sm ring-1 ring-slate-200/80 ${sizeClassName}`}
      decoding="async"
      onError={() => setOk(false)}
    />
  );
}

export function ShotFeedCard({
  shot,
  teamNames,
  playerNames,
  teamLogos,
  playerPics,
  playerFlags,
}: {
  shot: ShotEvent;
  teamNames: Record<string, string | undefined>;
  playerNames: Record<string, string | undefined>;
  teamLogos: Record<string, string | null | undefined>;
  playerPics: Record<string, string | null | undefined>;
  /** Player id → flag emoji */
  playerFlags?: Record<string, string | null | undefined>;
}) {
  const strikerScored = shot.goal;
  const keeperSaved = !shot.goal;
  const strikerName = playerNames[shot.strikerId] ?? "Striker";
  const keeperName = playerNames[shot.goalkeeperId] ?? "Keeper";
  const attackingTeamName =
    teamNames[shot.attackingTeamId] ?? "Attackers";
  const defendingTeamName =
    teamNames[shot.defendingTeamId] ?? "Defense";

  return (
    <div className="animate-match-feed-in rounded-xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-50/90 p-4 shadow-md ring-1 ring-slate-200/60 transition-shadow duration-300 hover:shadow-lg sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <FeedTeamLogo
          url={teamLogos[shot.attackingTeamId] ?? null}
          name={attackingTeamName}
          sizeClassName="h-11 w-11 sm:h-12 sm:w-12"
        />
        <p className="min-w-0 flex-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-slate-400">
          Shot · {attackingTeamName}
        </p>
        <FeedTeamLogo
          url={teamLogos[shot.defendingTeamId] ?? null}
          name={defendingTeamName}
          sizeClassName="h-10 w-10 opacity-90 sm:h-11 sm:w-11"
        />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 rounded-xl bg-emerald-50/50 px-3 py-3 ring-1 ring-emerald-100/90 sm:gap-4 sm:px-4 sm:py-3.5">
          <PlayerAvatar
            name={strikerName}
            profilePicUrl={playerPics[shot.strikerId]}
            sizeClassName="h-14 w-14"
            textClassName="text-base"
          />
          <OutcomeBadge
            ok={strikerScored}
            label={strikerScored ? "Striker: goal" : "Striker: saved"}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-emerald-800/90">
              Striker
            </p>
            <Link
              href={`/player/${shot.strikerId}`}
              className="inline-flex min-w-0 items-center gap-1.5 truncate text-base font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
            >
              {playerFlags?.[shot.strikerId] ?
                <span className="shrink-0 text-lg leading-none" aria-hidden>
                  {playerFlags[shot.strikerId]}
                </span>
              : null}
              <span className="truncate">{strikerName}</span>
            </Link>
            <p className={`mt-1 text-sm font-medium ${strikerScored ? "text-emerald-700" : "text-red-700/90"}`}>
              {strikerScored ? "Goal" : "Saved"}
            </p>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl bg-sky-50/60 px-3 py-3 ring-1 ring-sky-100/90 sm:gap-4 sm:px-4 sm:py-3.5">
          <PlayerAvatar
            name={keeperName}
            profilePicUrl={playerPics[shot.goalkeeperId]}
            sizeClassName="h-14 w-14"
            textClassName="text-base"
          />
          <OutcomeBadge
            ok={keeperSaved}
            label={keeperSaved ? "Goalkeeper: save" : "Goalkeeper: beaten"}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-sky-900/80">
              Goalkeeper
            </p>
            <Link
              href={`/player/${shot.goalkeeperId}`}
              className="inline-flex min-w-0 items-center gap-1.5 truncate text-base font-semibold text-slate-900 hover:text-emerald-800 hover:underline"
            >
              {playerFlags?.[shot.goalkeeperId] ?
                <span className="shrink-0 text-lg leading-none" aria-hidden>
                  {playerFlags[shot.goalkeeperId]}
                </span>
              : null}
              <span className="truncate">{keeperName}</span>
            </Link>
            <p className={`mt-1 text-sm font-medium ${keeperSaved ? "text-emerald-700" : "text-red-700/90"}`}>
              {keeperSaved ? "Save" : "Beaten"}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
        {formatShotFeedLine(shot, teamNames, playerNames)}
      </p>
    </div>
  );
}

export function TeamLogo({
  url,
  name,
  emoji,
}: {
  url: string | null;
  name: string;
  /** National-team matches: show flag when no club crest */
  emoji?: string | null;
}) {
  const [ok, setOk] = useState(Boolean(url));
  if ((!url || !ok) && emoji?.trim()) {
    return (
      <div
        className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border-2 border-white bg-slate-50 text-4xl leading-none shadow-md ring-2 ring-slate-300/80"
        aria-hidden
      >
        {emoji.trim()}
      </div>
    );
  }
  if (!url || !ok) {
    return (
      <div
        className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border-2 border-white bg-slate-200 text-xl font-black text-slate-600 shadow-md ring-2 ring-slate-300/80"
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-[4.5rem] w-[4.5rem] rounded-2xl border-2 border-white object-contain shadow-md ring-2 ring-slate-300/80"
      decoding="async"
      onError={() => setOk(false)}
    />
  );
}

function PlayerColumnRows({
  label,
  tone,
  list,
  fotMobById,
  showFotMob,
  shotsLog,
}: {
  label: string;
  tone: "st" | "gk" | "other";
  list: SetupPlayer[];
  fotMobById: Record<string, number>;
  showFotMob: boolean;
  shotsLog: ShotEvent[];
}) {
  if (list.length === 0) return null;
  const bar =
    tone === "st" ?
      "border-l-[3px] border-emerald-500"
    : tone === "gk" ?
      "border-l-[3px] border-sky-500"
    : "border-l-[3px] border-slate-400";
  return (
    <div className={`rounded-lg bg-white/90 pl-2 ${bar}`}>
      <p className="px-2 pb-2 pt-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <ul className="space-y-3.5 px-2 pb-3">
        {list.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-2 text-base text-slate-800 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
          >
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <PlayerAvatar
                name={p.name}
                profilePicUrl={p.profile_pic_url}
                sizeClassName="h-12 w-12 shrink-0"
                textClassName="text-sm"
              />
              <span className="min-w-0 flex-1">
                <Link
                  href={`/player/${p.id}`}
                  className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-bold leading-snug hover:text-emerald-800 hover:underline"
                >
                  {p.flag_emoji ?
                    <span className="shrink-0 text-lg leading-none" aria-hidden>
                      {p.flag_emoji}
                    </span>
                  : null}
                  <span className="min-w-0 break-words">{p.name}</span>
                </Link>
                <span className="ml-2 text-sm font-semibold text-slate-500">{p.role}</span>
                <PlayerShootingLine shotsLog={shotsLog} playerId={p.id} role={p.role} />
              </span>
            </span>
            {showFotMob && fotMobById[p.id] != null && (
              <span
                className={`shrink-0 self-start rounded-md px-2.5 py-1 text-sm font-extrabold tabular-nums sm:self-center ${fotMobBadgeClass(fotMobById[p.id])}`}
              >
                {fotMobById[p.id].toFixed(1)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlayerColumn({
  title,
  players,
  fotMobById,
  showFotMob,
  shotsLog,
}: {
  title: ReactNode;
  players: SetupPlayer[];
  fotMobById: Record<string, number>;
  showFotMob: boolean;
  shotsLog: ShotEvent[];
}) {
  const strikers = players.filter((p) => p.role === "ST");
  const goalkeepers = players.filter((p) => p.role === "GK");
  const other = players.filter((p) => p.role !== "ST" && p.role !== "GK");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
      <h3 className="mb-4 border-b border-slate-200 pb-2.5 text-sm font-bold uppercase tracking-wider text-slate-600">
        {title}
      </h3>
      <div className="flex flex-col gap-5">
        <PlayerColumnRows
          label="Strikers"
          tone="st"
          list={strikers}
          fotMobById={fotMobById}
          showFotMob={showFotMob}
          shotsLog={shotsLog}
        />
        <PlayerColumnRows
          label="Goalkeepers"
          tone="gk"
          list={goalkeepers}
          fotMobById={fotMobById}
          showFotMob={showFotMob}
          shotsLog={shotsLog}
        />
        {other.length > 0 ?
          <PlayerColumnRows
            label="Other"
            tone="other"
            list={other}
            fotMobById={fotMobById}
            showFotMob={showFotMob}
            shotsLog={shotsLog}
          />
        : null}
      </div>
    </div>
  );
}

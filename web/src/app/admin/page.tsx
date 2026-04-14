"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Database,
  Globe2,
  History,
  Landmark,
  Loader2,
  Medal,
  Shield,
  Plus,
  RotateCcw,
  Scale,
  Trash2,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { EndOfSeasonChecklistSection } from "@/components/admin/EndOfSeasonChecklistSection";
import { formatApplyWagesResponseMessage } from "@/lib/formatApplyWagesMessage";
import { parseTrophyList, type TrophyCabinetEntry } from "@/lib/trophyCabinet";
import { TROPHY_CABINET_SCOPES } from "@/lib/trophyCabinetScope";
import { squadAnnualWageBill } from "@/lib/economy";
import { compareSeasonLabelsDesc } from "@/lib/seasonLabelSort";

type League = {
  id: string;
  name: string;
  country: string;
  division: string;
  logo_url: string | null;
};

type TeamOption = {
  id: string;
  name: string;
  logo_url?: string | null;
  current_balance?: number;
  /** Sum of roster market values (for wage / transfer previews). */
  squad_market_value?: number;
};
type CountryOption = { id: string; code: string; name: string };
type NationalTeamOption = {
  id: string;
  name: string;
  confederation: string;
  flag_emoji?: string | null;
  countries?: { name?: string } | { name?: string }[] | null;
};
type PlayerOption = {
  id: string;
  name: string;
  nationality?: string;
  role?: string;
  age?: number;
  hidden_ovr?: number;
  team_id: string | null;
  market_value: number | null;
  profile_pic_url?: string | null;
  career_salary_earned?: number | null;
  trophies?: unknown;
};

type TrophyDefRow = {
  id: string;
  slug: string;
  name: string;
  icon_url: string | null;
  sort_order: number;
  cabinet_scope?: string;
};

type HonourEditRow = {
  trophy_slug: string;
  season: string;
  custom_name: string;
  /** Club or country / NT the honour was won with (e.g. international) */
  won_with: string;
};

function honourRowsFromTrophies(raw: unknown): HonourEditRow[] {
  return parseTrophyList(raw).map((e: TrophyCabinetEntry) => ({
    trophy_slug: e.trophy_slug ?? "",
    season: e.season ?? "",
    custom_name: e.trophy_slug ? "" : (e.name?.trim() ?? ""),
    won_with: e.won_with?.trim() ?? "",
  }));
}

function serializeHonourRows(rows: HonourEditRow[]): TrophyCabinetEntry[] {
  const out: TrophyCabinetEntry[] = [];
  for (const r of rows) {
    const season = r.season.trim();
    if (!season) continue;
    const ww = r.won_with.trim();
    if (r.trophy_slug) {
      out.push(
        ww ?
          { trophy_slug: r.trophy_slug, season, won_with: ww }
        : { trophy_slug: r.trophy_slug, season },
      );
    } else if (r.custom_name.trim()) {
      out.push(
        ww ?
          { name: r.custom_name.trim(), season, won_with: ww }
        : { name: r.custom_name.trim(), season },
      );
    }
  }
  return out;
}

type AdminPanel = "guide" | "data" | "players" | "trophies" | "season" | "cups" | "finance";

function adminPanelClass(active: boolean): string {
  return active
    ? "rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm"
    : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500";
}

function AdminGuideSection() {
  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">How this site works</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Short reference for seasons, money, cups, and simulation. The{" "}
        <Link href="/dashboard" className="font-semibold text-emerald-700 hover:underline">
          Dashboard
        </Link>{" "}
        is where you view tables and international tabs; this page runs admin actions (service role).
      </p>

      <div className="mt-6 space-y-6 text-sm text-zinc-700">
        <div>
          <h3 className="font-bold text-zinc-900">1. Starting a season</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              <strong>Seasons</strong> (Data tab): create a season label if you don&apos;t have one (e.g.{" "}
              <code className="rounded bg-zinc-100 px-1 font-mono text-xs">2026/27</code>).
            </li>
            <li>
              Set the app&apos;s <strong>current season</strong> in settings so APIs and Matchday know which label to use (see season settings / env).
            </li>
            <li>
              <strong>Season maker</strong> (Season tab): builds the fixture list for that label from current leagues and teams — double round-robin league games plus{" "}
              <strong>regional cup</strong> quarter-finals (4 D1 vs 4 D2 crossovers per country). It replaces existing fixtures for that season label.
            </li>
            <li>
              Open the <Link href="/dashboard" className="font-semibold text-emerald-700 hover:underline">Dashboard</Link>, choose the same season, then play matches from{" "}
              <strong>Next up</strong> or <strong>Matchday</strong> URLs.
            </li>
          </ol>
        </div>

        <div>
          <h3 className="font-bold text-zinc-900">2. Trades (transfer market)</h3>
          <p className="mt-2">
            Use <strong>Transfer market</strong> (Finance tab): pick a player, buyer club, and fee. The seller&apos;s club is credited the fee; the buyer is debited. Free
            agents only debit the buyer. The player&apos;s club assignment updates immediately. Everything logs to <code className="font-mono text-xs">team_transactions</code>{" "}
            and updates club balances.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-zinc-900">3. How players are paid (wages)</h3>
          <p className="mt-2">
            There are no per-match salary line items. Once per season, <strong>Pay season wages</strong> (Admin checklist → <strong>Beginning of season</strong>) charges each club{" "}
            <strong>50% of its squad&apos;s total market value</strong> (contract cost). That debit is one team transaction. On player profiles,{" "}
            <strong>Career salary earned</strong> increases each time wages run: each player on the roster is credited{" "}
            <strong>50% of their own MV at that moment</strong> (those shares add up to the same team wage bill). Run Apply wages when you want that season&apos;s bill (e.g. after advancing the season label), and only once per team per season label (the app tracks <code className="font-mono text-xs">last_wages_season</code>).
          </p>
        </div>

        <div>
          <h3 className="font-bold text-zinc-900">4. Champions League</h3>
          <p className="mt-2">
            <strong>Promotion &amp; relegation</strong> (End of season checklist) reads completed league fixtures and updates divisions. Champions League{" "}
            <code className="font-mono text-xs">tournament_entries</code> seeding is optional when you close a season.{" "}
            <strong>CL payout</strong> lets you pay prize money to clubs (winner, runner-up, etc.) via team transactions. Scheduled CL knockout matches may be exposed under
            the universe/champions-league API depending on your setup; the <strong>Dashboard → Champions League</strong> view lists qualified teams.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-zinc-900">5. International tournaments</h3>
          <p className="mt-2">
            <strong>Seed national teams</strong> links countries to confederations. <strong>International call-ups</strong> pick 2 strikers + 1 goalkeeper per nation for a
            season. Bootstrap international comps (usually once per season) creates Nations League / Gold Cup / World Cup structures in the database.{" "}
            <strong>Simulate</strong> (via API <code className="rounded bg-zinc-100 px-1 font-mono text-xs">/api/competitions/international/simulate</code>) resolves
            fixtures: scores, caps, international stats, FotMob-style ratings, and MV bumps. Stages can advance (groups → knockouts) after rounds complete.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-zinc-900">6. How match simulation works</h3>
          <p className="mt-2">
            <strong>Domestic (Matchday):</strong> Turn-based “shots” alternate home/away; each chance matches a striker vs goalkeeper using hidden OVR. Results update goals,
            saves, player ratings, FotMob scores, and stats rows. Club finances get matchday fees/bonuses where configured. <strong>International:</strong> uses call-ups to
            distribute goals/saves and update <code className="font-mono text-xs">player_international_stats</code>.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-zinc-900">7. Regional cups</h3>
          <p className="mt-2">
            Cup ties are <code className="font-mono text-xs">regional_cup</code> fixtures per country. Season maker inserts QF pairings. Play them in Matchday like league
            games. Semi-finals/finals may require extending the schedule in code/DB — check Dashboard domestic view for the Regional cup card.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function AdminPage() {
  const [panel, setPanel] = useState<AdminPanel>("guide");
  const [leagues, setLeagues] = useState<League[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [countries, setCountries] = useState<(CountryOption & { flag_emoji?: string | null })[]>([]);
  const [nationalTeams, setNationalTeams] = useState<NationalTeamOption[]>([]);
  const [seasons, setSeasons] = useState<{ id: string; label: string }[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    setLoadError(null);
    try {
      const [lr, tr, cr, pr, sr, nr] = await Promise.all([
        fetch("/api/admin/leagues"),
        fetch("/api/admin/teams"),
        fetch("/api/admin/countries"),
        fetch("/api/admin/players"),
        fetch("/api/admin/seasons"),
        fetch("/api/admin/national-teams"),
      ]);
      if (!lr.ok) throw new Error((await lr.json()).error ?? "Leagues failed");
      if (!tr.ok) throw new Error((await tr.json()).error ?? "Teams failed");
      if (!cr.ok) throw new Error((await cr.json()).error ?? "Countries failed");
      if (!pr.ok) throw new Error((await pr.json()).error ?? "Players failed");
      if (!sr.ok) throw new Error((await sr.json()).error ?? "Seasons failed");
      if (!nr.ok) throw new Error((await nr.json()).error ?? "National teams failed");
      setLeagues(await lr.json());
      setTeams(await tr.json());
      setCountries(await cr.json());
      setPlayers(await pr.json());
      setSeasons(await sr.json());
      setNationalTeams(await nr.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load data");
    }
  }, []);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-10 flex items-start gap-4 border-b border-slate-300/80 pb-8">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-md">
          <Shield className="h-7 w-7" aria-hidden />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Control room
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Use the sections below — start with <strong>How it works</strong>, then{" "}
            <strong>World &amp; data</strong> and <strong>Season flow</strong>. Service role API.
          </p>
          <p className="mt-3">
            <Link
              href="/admin/saved-match-backfill"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 hover:underline"
            >
              <Wrench className="h-4 w-4" aria-hidden />
              Saved match backfill (missing replay rows)
            </Link>
          </p>
        </div>
      </header>

      {loadError && (
        <p
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {loadError}
        </p>
      )}

      <nav
        className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
        aria-label="Admin sections"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 sm:mr-2">
          Section
        </span>
        <button
          type="button"
          onClick={() => setPanel("guide")}
          className={`inline-flex items-center gap-1.5 ${adminPanelClass(panel === "guide")}`}
        >
          <BookOpen className="h-4 w-4" />
          How it works
        </button>
        <button
          type="button"
          onClick={() => setPanel("data")}
          className={`inline-flex items-center gap-1.5 ${adminPanelClass(panel === "data")}`}
        >
          <Database className="h-4 w-4" />
          World &amp; data
        </button>
        <button
          type="button"
          onClick={() => setPanel("players")}
          className={`inline-flex items-center gap-1.5 ${adminPanelClass(panel === "players")}`}
        >
          <Users className="h-4 w-4" />
          Players
        </button>
        <button
          type="button"
          onClick={() => setPanel("season")}
          className={`inline-flex items-center gap-1.5 ${adminPanelClass(panel === "season")}`}
        >
          <CalendarClock className="h-4 w-4" />
          Season flow
        </button>
        <button
          type="button"
          onClick={() => setPanel("trophies")}
          className={`inline-flex items-center gap-1.5 ${adminPanelClass(panel === "trophies")}`}
        >
          <Trophy className="h-4 w-4" />
          Trophies
        </button>
        <button
          type="button"
          onClick={() => setPanel("cups")}
          className={`inline-flex items-center gap-1.5 ${adminPanelClass(panel === "cups")}`}
        >
          <Medal className="h-4 w-4" />
          Cups &amp; intl
        </button>
        <button
          type="button"
          onClick={() => setPanel("finance")}
          className={`inline-flex items-center gap-1.5 ${adminPanelClass(panel === "finance")}`}
        >
          <Landmark className="h-4 w-4" />
          Finance
        </button>
      </nav>

      <div className="flex flex-col gap-8">
        {panel === "guide" && <AdminGuideSection />}

        {panel === "data" && (
          <>
            <CountryManagerSection countries={countries} onSuccess={refreshLists} />
            <SeasonManagerSection seasons={seasons} onSuccess={refreshLists} />
            <EditLeagueSection leagues={leagues} onSaved={refreshLists} />
            <CreateTeamSection
              leagues={leagues}
              countries={countries}
              onSuccess={refreshLists}
            />
            <EditTeamSection
              teams={teams}
              leagues={leagues}
              countries={countries}
              onSuccess={refreshLists}
            />
          </>
        )}

        {panel === "players" && (
          <>
            <CreatePlayerSection
              teams={teams}
              countries={countries}
              onSuccess={refreshLists}
            />
            <EditPlayerSection
              players={players}
              teams={teams}
              countries={countries}
              onSuccess={refreshLists}
            />
          </>
        )}

        {panel === "trophies" && <TrophyLibrarySection />}

        {panel === "season" && (
          <>
            <SeasonMakerSection />
            <EndOfSeasonChecklistSection />
            <SyncMvHistoryForSeasonSection seasons={seasons} />
            <SimPreviewToggleSection />
            <TournamentsModeToggleSection />
            <InternationalTournamentAdminSection />
            <SeasonAwardsSection players={players} seasons={seasons} />
          </>
        )}

        {panel === "cups" && (
          <>
            <NationalTeamsSeedSection />
            <EditNationalTeamSection
              nationalTeams={nationalTeams}
              teams={teams}
              countries={countries}
              onSuccess={refreshLists}
            />
            <InternationalCallupsSection nationalTeams={nationalTeams} />
          </>
        )}

        {panel === "finance" && (
          <>
            <SyncMvHistoryForSeasonSection seasons={seasons} />
            <TransferMarketSection teams={teams} onSuccess={refreshLists} />
            <ResetPeakMarketValueSection onSuccess={refreshLists} />
            <BackfillStatsTeamIdSection />
            <ReleasePlayerSection players={players} onSuccess={refreshLists} />
            <FreeAgencyPickupSection players={players} teams={teams} onSuccess={refreshLists} />
            <ApplyWagesSection />
            <ReconcileTeamBalancesSection onSuccess={refreshLists} />
            <ResetSimulationSection onSuccess={refreshLists} />
            <InsolvencySection />
          </>
        )}
      </div>
    </div>
  );
}

function InternationalTournamentAdminSection() {
  const [tmOn, setTmOn] = useState(false);
  const [wcSeason, setWcSeason] = useState("");
  const [qualSeason, setQualSeason] = useState("");
  const [clearSeason, setClearSeason] = useState("");
  const [clearEntries, setClearEntries] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<"seed" | "clear" | null>(null);

  useEffect(() => {
    fetch("/api/admin/tournaments-mode")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setTmOn(!!d.enabled))
      .catch(() => setTmOn(false));
  }, []);

  async function seedWorldCup() {
    setPending("seed");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/world-cup-seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldCupSeasonLabel: wcSeason.trim(),
          qualifierSeasonLabel: qualSeason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg(
        `World Cup seeded for ${data.worldCupSeasonLabel} from qualifiers in ${data.qualifierSeasonLabel}.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function clearFixtures() {
    setPending("clear");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/international-clear-fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonLabel: clearSeason.trim(),
          slug: "world_cup",
          clearEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg(
        `Cleared World Cup fixtures${data.entriesCleared ? " and WC entries" : ""} for ${clearSeason.trim() || "—"}.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  if (!tmOn) {
    return (
      <section className="rounded-2xl border border-zinc-200/90 bg-zinc-50/50 p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">International — World Cup &amp; fixtures</h2>
        <p className="text-sm text-zinc-500">
          Turn on <strong>Tournaments mode</strong> above to show seed World Cup and delete World Cup fixtures.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-indigo-200/90 bg-indigo-50/30 p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900">International — World Cup &amp; fixtures</h2>
      <p className="mb-4 text-sm text-zinc-600">
        World Cup qualifiers are registered automatically to the <strong>next season</strong> after each regional
        tournament (top 2 per group). Use <strong>Seed World Cup</strong> to draw balanced groups (2 UEFA + 2 FIFA per
        group) from the prior season&apos;s completed Nations League + Gold Cup groups.{" "}
        <strong>Delete World Cup fixtures</strong> only affects the World Cup for the season you enter (optional: clear WC
        entries too).
      </p>
      <div className="space-y-4">
        <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-4">
          <h3 className="text-sm font-bold text-zinc-900">Seed World Cup (balanced groups)</h3>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
              World Cup season
              <input
                value={wcSeason}
                onChange={(e) => setWcSeason(e.target.value)}
                placeholder="Season 2"
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
              Qualifier season (NL + GC)
              <input
                value={qualSeason}
                onChange={(e) => setQualSeason(e.target.value)}
                placeholder="Season 1"
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void seedWorldCup()}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              {pending === "seed" ? "Seeding…" : "Seed World Cup"}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-rose-200/80 bg-white/80 p-4">
          <h3 className="text-sm font-bold text-zinc-900">Delete World Cup fixtures</h3>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
              World Cup season
              <input
                value={clearSeason}
                onChange={(e) => setClearSeason(e.target.value)}
                placeholder="Season 2"
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={clearEntries}
                onChange={(e) => setClearEntries(e.target.checked)}
                className="rounded border-zinc-400"
              />
              Also clear WC entries (qualifiers)
            </label>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void clearFixtures()}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
            >
              {pending === "clear" ? "Deleting…" : "Delete World Cup fixtures"}
            </button>
          </div>
        </div>
      </div>
      {msg && <p className="mt-3 text-sm text-zinc-700">{msg}</p>}
    </section>
  );
}

function CountryManagerSection({
  countries,
  onSuccess,
}: {
  countries: (CountryOption & { flag_emoji?: string | null })[];
  onSuccess: () => void | Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [flag, setFlag] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editFlag, setEditFlag] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const current = countries.find((c) => c.id === selectedId);
    if (!current) return;
    setEditCode(current.code);
    setEditName(current.name);
    setEditFlag(current.flag_emoji ?? "");
  }, [countries, selectedId]);

  async function createCountry() {
    setMessage(null);
    try {
      const res = await fetch("/api/admin/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, flag_emoji: flag || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCode("");
      setName("");
      setFlag("");
      setMessage(`Created ${data.name} (${data.code})`);
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  async function updateCountry() {
    if (!selectedId) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/countries/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editCode, name: editName, flag_emoji: editFlag || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Updated ${data.name} (${data.code})`);
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">
        Countries & flags
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-700">Create country</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Code (ENG)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Name (England)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Flag emoji (optional)"
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createCountry()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Create country
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-700">Edit country</p>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Select country…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Code"
              value={editCode}
              onChange={(e) => setEditCode(e.target.value.toUpperCase())}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Flag emoji (e.g. 🇫🇷, 🇪🇸, 🏴)"
            value={editFlag}
            onChange={(e) => setEditFlag(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => void updateCountry()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
          >
            Save country
          </button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function SeasonManagerSection({
  seasons,
  onSuccess,
}: {
  seasons: { id: string; label: string }[];
  onSuccess: () => void | Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function createSeason() {
    setMessage(null);
    try {
      const res = await fetch("/api/admin/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, makeCurrent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setLabel("");
      setMessage(
        data.madeCurrent ? `Created ${data.label} (now current)` : `Created ${data.label}`,
      );
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">Seasons</h2>
      <p className="mb-3 text-sm text-zinc-600">
        Create fully custom season labels and optionally set the current season used across the site.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="2027/28"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={makeCurrent}
            onChange={(e) => setMakeCurrent(e.target.checked)}
          />
          Set as current season
        </label>
        <button
          type="button"
          onClick={() => void createSeason()}
          disabled={!label.trim()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Create season
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
      {seasons.length > 0 && (
        <p className="mt-3 text-xs text-zinc-500">
          Existing: {seasons.slice(0, 6).map((s) => s.label).join(", ")}
          {seasons.length > 6 ? "…" : ""}
        </p>
      )}
    </section>
  );
}

function SimPreviewToggleSection() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshSeason, setRefreshSeason] = useState("");
  const [refreshPending, setRefreshPending] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/sim-preview-test-mode")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setEnabled(!!d.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(next: boolean) {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/sim-preview-test-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEnabled(!!data.enabled);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function refreshKnockouts() {
    setRefreshPending(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/admin/tournament-progress-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonLabel: refreshSeason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const r = data.regionalCup as { sfInserted?: number; fInserted?: number };
      const cl = data.championsLeague as { clSfInserted?: number; clFinalInserted?: boolean };
      setRefreshMsg(
        `Cups: +${r?.sfInserted ?? 0} SF rows, +${r?.fInserted ?? 0} final. CL: +${cl?.clSfInserted ?? 0} SF, final ${cl?.clFinalInserted ? "yes" : "no"}.`,
      );
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setRefreshPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200/90 bg-amber-50/40 p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900">Sim preview test mode</h2>
      <p className="mb-3 text-sm text-zinc-600">
        When enabled, shows preview-only controls: tournament seeds that bypass normal gates, and one-click fake
        stages so you can inspect brackets and layouts. Default is <strong>off</strong>; toggling saves immediately.
      </p>
      <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-zinc-800">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-400"
          checked={enabled}
          disabled={loading || pending}
          onChange={(e) => void save(e.target.checked)}
        />
        {loading ? "Loading…" : pending ? "Saving…" : "Show preview / test controls"}
      </label>
      {msg && <p className="mt-2 text-sm text-zinc-700">{msg}</p>}
      {enabled && (
        <div className="mt-4 rounded-lg border border-amber-300/80 bg-white/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Knockout refresh (backfill)
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Re-runs regional cup (QF→SF→F) and Champions League (group→SF→F) progression for the season. Use if you
            finished rounds before auto-progress existed, or to fix stuck brackets.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              value={refreshSeason}
              onChange={(e) => setRefreshSeason(e.target.value)}
              placeholder="Season label (empty = current)"
              className="min-w-[10rem] rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={refreshPending}
              onClick={() => void refreshKnockouts()}
              className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
            >
              {refreshPending ? "Refreshing…" : "Refresh knockouts"}
            </button>
          </div>
          {refreshMsg && <p className="mt-2 text-xs text-zinc-700">{refreshMsg}</p>}
        </div>
      )}
    </section>
  );
}

function TournamentsModeToggleSection() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/tournaments-mode")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setEnabled(!!d.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(next: boolean) {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tournaments-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEnabled(!!data.enabled);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-200/90 bg-sky-50/40 p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900">Tournaments mode</h2>
      <p className="mb-3 text-sm text-zinc-600">
        When enabled, the Matchday dashboard shows <strong>Seed CL</strong>, <strong>Preview seed</strong> (if Sim preview
        is on), and <strong>Refresh semis</strong> for Champions League, and the international hub shows{" "}
        <strong>Generate Nations League</strong> / <strong>Generate Gold Cup</strong>, plus{" "}
        <strong>Seed World Cup</strong> / <strong>Delete World Cup fixtures</strong>. Default is{" "}
        <strong>off</strong> so those actions stay hidden in normal play.
      </p>
      <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-zinc-800">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-400"
          checked={enabled}
          disabled={loading || pending}
          onChange={(e) => void save(e.target.checked)}
        />
        {loading ? "Loading…" : pending ? "Saving…" : "Show tournament seed / refresh controls"}
      </label>
      {msg && <p className="mt-2 text-sm text-zinc-700">{msg}</p>}
    </section>
  );
}

function SeasonMakerSection() {
  const [seasonLabel, setSeasonLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/season-maker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel: seasonLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(
        `Created ${data.fixturesCreated} fixtures for ${data.seasonLabel}.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">Season maker</h2>
      <p className="mb-3 text-sm text-zinc-600">
        Generates/rebuilds domestic fixtures for a season label.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={seasonLabel}
          onChange={(e) => setSeasonLabel(e.target.value)}
          placeholder="2027/28"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => void run()}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create season fixtures"}
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function NationalTeamsSeedSection() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/national-teams", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Seeded ${data.createdOrUpdated} national team(s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">National teams</h2>
      <p className="mb-3 text-sm text-zinc-600">
        Creates one national team per country (separate from domestic leagues).
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Seeding..." : "Seed national teams"}
      </button>
      {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function EditNationalTeamSection({
  nationalTeams,
  teams,
  countries,
  onSuccess,
}: {
  nationalTeams: NationalTeamOption[];
  teams: TeamOption[];
  countries: CountryOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [honourRows, setHonourRows] = useState<HonourEditRow[]>([]);
  const [trophySlugs, setTrophySlugs] = useState<{ slug: string; name: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/trophy-definitions")
      .then((r) => r.json())
      .then((data: TrophyDefRow[]) => {
        if (Array.isArray(data)) {
          setTrophySlugs(data.map((d) => ({ slug: d.slug, name: d.name })));
        }
      })
      .catch(() => setTrophySlugs([]));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHonourRows([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/admin/national-teams/${selectedId}`);
      const d = await res.json();
      if (!res.ok) return;
      setName(d.name ?? "");
      setHonourRows(honourRowsFromTrophies(d.trophies));
    })();
  }, [selectedId]);

  async function save() {
    if (!selectedId) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/national-teams/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          trophies: serializeHonourRows(honourRows),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Updated ${data.name}`);
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  function addHonourRow() {
    setHonourRows((h) => [...h, { trophy_slug: "", season: "", custom_name: "", won_with: "" }]);
  }

  function removeHonourRow(i: number) {
    setHonourRows((h) => h.filter((_, j) => j !== i));
  }

  function patchHonourRow(i: number, patch: Partial<HonourEditRow>) {
    setHonourRows((h) => h.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">Edit national team</h2>
      <p className="mb-3 text-sm text-zinc-600">
        Manage the <strong>honours cabinet</strong> (e.g. World Cup) — stars on the public country page count{" "}
        <code className="rounded bg-zinc-100 px-1 font-mono text-xs">world_cup</code> entries.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select national team…</option>
          {nationalTeams.map((n) => (
            <option key={n.id} value={n.id}>
              {(n.flag_emoji ?? "🏳️")} {n.name}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">Honours (trophy cabinet)</h3>
        <ul className="space-y-3">
          {honourRows.map((row, i) => (
            <li
              key={`nth-${i}`}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Trophy type</span>
                <select
                  value={row.trophy_slug}
                  onChange={(e) => patchHonourRow(i, { trophy_slug: e.target.value })}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="">— Custom title —</option>
                  {trophySlugs.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {!row.trophy_slug ?
                <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs">
                  <span className="font-medium text-zinc-600">Custom title</span>
                  <input
                    value={row.custom_name}
                    onChange={(e) => patchHonourRow(i, { custom_name: e.target.value })}
                    placeholder="e.g. Olympic gold"
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                  />
                </label>
              : null}
              <label className="flex min-w-[6rem] flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Season</span>
                <input
                  value={row.season}
                  onChange={(e) => patchHonourRow(i, { season: e.target.value })}
                  placeholder="2025/26"
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 font-mono text-sm"
                />
              </label>
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Won with (optional)</span>
                <WonWithPicker
                  value={row.won_with}
                  onChange={(v) => patchHonourRow(i, { won_with: v })}
                  teams={teams}
                  countries={countries}
                />
              </div>
              <button
                type="button"
                onClick={() => removeHonourRow(i)}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50"
                aria-label="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addHonourRow}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add honour
        </button>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!selectedId}
        className="mt-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
      >
        Save national team
      </button>
      {message && <p className="mt-2 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function InternationalCallupsSection({
  nationalTeams,
}: {
  nationalTeams: NationalTeamOption[];
}) {
  const [selectedNt, setSelectedNt] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("");
  const [pool, setPool] = useState<
    {
      id: string;
      name: string;
      role: string;
      market_value?: number | null;
      profile_pic_url?: string | null;
    }[]
  >([]);
  const [st1, setSt1] = useState("");
  const [st2, setSt2] = useState("");
  const [gk1, setGk1] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedNt) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ nationalTeamId: selectedNt });
        if (seasonLabel.trim()) qs.set("season", seasonLabel.trim());
        const res = await fetch(`/api/admin/international/callups?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (cancelled) return;
        setPool(data.pool ?? []);
        const sel = new Map<string, string>((data.selected ?? []).map((r: any) => [String(r.slot), String(r.player_id)]));
        setSt1((sel.get("ST1") as string | undefined) ?? "");
        setSt2((sel.get("ST2") as string | undefined) ?? "");
        setGk1((sel.get("GK1") as string | undefined) ?? "");
        setMessage(`Loaded ${data.countryName} pool (${(data.pool ?? []).length} players).`);
      } catch (e) {
        if (!cancelled) setMessage(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedNt, seasonLabel]);

  async function save() {
    setMessage(null);
    try {
      const res = await fetch("/api/admin/international/callups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nationalTeamId: selectedNt,
          ...(seasonLabel.trim() ? { seasonLabel: seasonLabel.trim() } : {}),
          st1,
          st2,
          gk1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage("Callups saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  const sts = [...pool]
    .filter((p) => p.role === "ST")
    .sort((a, b) => Number(b.market_value ?? 0) - Number(a.market_value ?? 0));
  const gks = [...pool]
    .filter((p) => p.role === "GK")
    .sort((a, b) => Number(b.market_value ?? 0) - Number(a.market_value ?? 0));

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">
        International call-ups (2 ST + 1 GK)
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={selectedNt}
          onChange={(e) => setSelectedNt(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select national team…</option>
          {nationalTeams.map((n) => (
            <option key={n.id} value={n.id}>
              {(n.flag_emoji ?? "🏳️")} {n.name} ({n.confederation})
            </option>
          ))}
        </select>
        <input
          value={seasonLabel}
          onChange={(e) => setSeasonLabel(e.target.value)}
          placeholder="Optional season label"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      {selectedNt && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">ST1</span>
            <div className="flex items-center gap-2">
              {st1 ?
                <PlayerAvatar
                  name={sts.find((p) => p.id === st1)?.name ?? "?"}
                  profilePicUrl={sts.find((p) => p.id === st1)?.profile_pic_url}
                  sizeClassName="h-9 w-9"
                />
              : null}
              <select
                value={st1}
                onChange={(e) => setSt1(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">Choose…</option>
                {sts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">ST2</span>
            <div className="flex items-center gap-2">
              {st2 ?
                <PlayerAvatar
                  name={sts.find((p) => p.id === st2)?.name ?? "?"}
                  profilePicUrl={sts.find((p) => p.id === st2)?.profile_pic_url}
                  sizeClassName="h-9 w-9"
                />
              : null}
              <select
                value={st2}
                onChange={(e) => setSt2(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">Choose…</option>
                {sts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">GK1</span>
            <div className="flex items-center gap-2">
              {gk1 ?
                <PlayerAvatar
                  name={gks.find((p) => p.id === gk1)?.name ?? "?"}
                  profilePicUrl={gks.find((p) => p.id === gk1)?.profile_pic_url}
                  sizeClassName="h-9 w-9"
                />
              : null}
              <select
                value={gk1}
                onChange={(e) => setGk1(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">Choose…</option>
                {gks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={!selectedNt || !st1 || !st2 || !gk1}
        className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        Save callups
      </button>
      {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function CreateTeamSection({
  leagues,
  countries,
  onSuccess,
}: {
  leagues: League[];
  countries: CountryOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setMessage(null);
    const fd = new FormData(form);
    const leagueId = String(fd.get("league_id") ?? "").trim();
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      country: String(fd.get("country") ?? "").trim(),
      logo_url: String(fd.get("logo_url") ?? "").trim() || null,
      league_id: leagueId || null,
    };
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMessage({ ok: true, text: `Team “${data.name}” created.` });
      form.reset();
      await onSuccess();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Failed to create team",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <Building2 className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">Create team</h2>
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">
              Name
            </span>
            <input
              name="name"
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="inline-flex items-center gap-1 font-medium text-zinc-700">
              <Globe2 className="h-3.5 w-3.5 opacity-70" />
              Country
            </span>
            {countries.length > 0 ? (
              <select
                name="country"
                required
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
              >
                <option value="">Select country…</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name="country"
                required
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
              />
            )}
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            League
          </span>
          <select
            name="league_id"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
          >
            <option value="">No league</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.country}, {l.division})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Logo URL
          </span>
          <input
            name="logo_url"
            type="url"
            placeholder="https://…"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
          />
        </label>
        <p className="text-xs text-zinc-500">
          Budget and current balance default to 25,000,000.
        </p>
        {message && (
          <p
            className={
              message.ok
                ? "flex items-center gap-2 text-sm text-emerald-600"
                : "text-sm text-red-600"
            }
          >
            {message.ok && <Check className="h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          Create team
        </button>
      </form>
    </section>
  );
}

function CreatePlayerSection({
  teams,
  countries,
  onSuccess,
}: {
  teams: TeamOption[];
  countries: CountryOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [hiddenOvr, setHiddenOvr] = useState(50);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setMessage(null);
    const fd = new FormData(form);
    const teamRaw = String(fd.get("team_id") ?? "");
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      nationality: String(fd.get("nationality") ?? "").trim(),
      role: String(fd.get("role") ?? "ST"),
      hidden_ovr: hiddenOvr,
      age: parseInt(String(fd.get("age") ?? "24"), 10) || 24,
      market_value: parseFloat(String(fd.get("market_value") ?? "0")) || 0,
      profile_pic_url: String(fd.get("profile_pic_url") ?? "").trim() || null,
      team_id: teamRaw === "free" || teamRaw === "" ? null : teamRaw,
    };
    try {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMessage({ ok: true, text: `Player “${data.name}” created.` });
      form.reset();
      setHiddenOvr(50);
      await onSuccess();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Failed to create player",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <UserPlus className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">Create player</h2>
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">
              Name
            </span>
            <input
              name="name"
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">
              Nationality
            </span>
            {countries.length > 0 ? (
              <select
                name="nationality"
                required
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
              >
                <option value="">Select nationality…</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name="nationality"
                required
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
              />
            )}
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Age
          </span>
          <input
            name="age"
            type="number"
            min={16}
            max={50}
            defaultValue={24}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">
              Role
            </span>
            <select
              name="role"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
            >
              <option value="ST">ST</option>
              <option value="GK">GK</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">
              Team
            </span>
            <select
              name="team_id"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
            >
              <option value="free">Free agent</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Market value
          </span>
          <input
            name="market_value"
            type="number"
            min={0}
            step={1000}
            defaultValue={0}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Profile picture URL
          </span>
          <input
            name="profile_pic_url"
            type="url"
            placeholder="https://…"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
          />
        </label>
        <details className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700">
            Hidden OVR (sim engine — not shown on public player pages)
          </summary>
          <p className="mt-2 text-xs text-zinc-500">
            Default 50. Public roster hides this; match sim uses hidden_ovr.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={hiddenOvr}
              onChange={(ev) => setHiddenOvr(Number(ev.target.value))}
              className="min-w-[180px] flex-1 accent-emerald-600"
              aria-label="Hidden OVR"
            />
            <span className="tabular-nums text-sm font-medium text-zinc-800">
              {hiddenOvr}
            </span>
          </div>
        </details>
        {message && (
          <p
            className={
              message.ok
                ? "flex items-center gap-2 text-sm text-emerald-600"
                : "text-sm text-red-600"
            }
          >
            {message.ok && <Check className="h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Create player
        </button>
      </form>
    </section>
  );
}

function ApplyWagesSection() {
  const [pending, setPending] = useState<"wages" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runApplyWages() {
    setPending("wages");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/apply-wages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(formatApplyWagesResponseMessage(data));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(null);
    }
  }

  async function runResetLastWagesSeason() {
    setPending("reset");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reset-last-wages-season", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(
        `Cleared last wages season for ${data.teamCount ?? 0} team(s). You can run Apply wages again.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <Wallet className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">Season wages (50% squad MV)</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Once per season label: deducts 50% of total squad market value from each
        club and logs a wages transaction. Skips teams already processed for that
        season. Each player on the roster also gets their{" "}
        <strong>career salary earned</strong> increased by 50% of their current MV
        (player profiles and the guide explain the split).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runApplyWages()}
          disabled={pending !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending === "wages" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Apply wages (current season)
        </button>
        <button
          type="button"
          onClick={() => void runResetLastWagesSeason()}
          disabled={pending !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/80 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
        >
          {pending === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Reset last wages season (all teams)
        </button>
      </div>
      {message && (
        <p className="mt-3 text-sm text-zinc-700">{message}</p>
      )}
    </section>
  );
}

type BalanceDriftRow = {
  teamId: string;
  name: string;
  budget: number;
  sumTransactions: number;
  currentBalance: number;
  expectedBalance: number;
  drift: number;
};

function ReconcileTeamBalancesSection({
  onSuccess,
}: {
  onSuccess: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<"scan" | "fix" | null>(null);
  const [mismatches, setMismatches] = useState<BalanceDriftRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function scan() {
    setPending("scan");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reconcile-team-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const rows = (data.mismatches ?? []) as BalanceDriftRow[];
      setMismatches(rows);
      if (rows.length === 0) {
        setMessage(
          "All clubs match the ledger: each current balance equals its opening anchor plus the sum of its transaction rows.",
        );
      } else {
        setMessage(
          `${rows.length} club(s) do not match that formula. Compare Current vs Expected — if Expected is right, use Fix balances.`,
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
      setMismatches(null);
    } finally {
      setPending(null);
    }
  }

  async function fix() {
    setPending("fix");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reconcile-team-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const remaining = (data.remaining ?? []) as BalanceDriftRow[];
      setMismatches(remaining);
      await onSuccess();
      const fixed = Number(data.fixed ?? 0);
      if (remaining.length === 0) {
        setMessage(`Updated ${fixed} club balance(s). All match the ledger now.`);
      } else {
        setMessage(
          `Updated ${fixed} club(s). ${remaining.length} still drift — investigate stuck payouts or rows changed outside Admin.`,
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <Scale className="h-5 w-5 text-emerald-600" aria-hidden />
        <h2 className="text-lg font-semibold">Club balances vs ledger</h2>
      </div>
      <p className="mb-3 text-sm text-zinc-600">
        <strong>Expected balance</strong> = <strong>opening anchor</strong>{" "}
        <span className="text-zinc-500">(DB column </span>
        <code className="rounded bg-zinc-100 px-1 font-mono text-xs">budget</code>
        <span className="text-zinc-500">)</span> <strong>+</strong> sum of all{" "}
        <code className="rounded bg-zinc-100 px-1 font-mono text-xs">team_transactions</code> amounts. Day-to-day cash
        is only <code className="rounded bg-zinc-100 px-1 font-mono text-xs">current_balance</code>; the anchor is
        updated for you when you change balance in <strong>Edit team</strong> so it stays &quot;cash minus everything
        logged.&quot; Drift means the bank figure and the journal disagree (rare partial write or DB edited outside
        Admin).
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void scan()}
          disabled={pending !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        >
          {pending === "scan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
          Scan for mismatches
        </button>
        <button
          type="button"
          onClick={() => void fix()}
          disabled={pending !== null || !mismatches || mismatches.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending === "fix" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Fix balances (set to expected)
        </button>
      </div>
      {mismatches && mismatches.length > 0 ?
        <div className="mb-3 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Club</th>
                <th className="px-3 py-2 text-right" title="Ledger opening anchor (teams.budget)">
                  Anchor
                </th>
                <th className="px-3 py-2 text-right">Σ transactions</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Current</th>
                <th className="px-3 py-2 text-right">Drift</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((r) => (
                <tr key={r.teamId} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-medium text-zinc-900">{r.name}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-700">
                    £{r.budget.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-700">
                    £{r.sumTransactions.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-emerald-800">
                    £{r.expectedBalance.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-700">
                    £{r.currentBalance.toLocaleString()}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${
                      r.drift > 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {r.drift > 0 ? "+" : ""}£{r.drift.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      : null}
      {message && <p className="text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function BackfillStatsTeamIdSection() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(overwrite: boolean) {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/backfill-stats-team-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwrite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(
        overwrite ?
          `Updated ${data.updatedRows} stat row(s) across ${data.playersWithClub} player(s) with a club (overwrote existing club on stats).`
        : `Filled ${data.updatedRows} stat row(s) with each player's current club (${data.playersWithClub} players with a club; only rows that had no club saved).`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-zinc-900">
        <Users className="h-4 w-4 text-zinc-600" aria-hidden />
        <h3 className="text-sm font-semibold">League stats — club column</h3>
      </div>
      <p className="mb-3 text-xs text-zinc-600">
        Backfills <code className="rounded bg-white px-1 font-mono text-[0.65rem]">stats.team_id</code> from each
        player&apos;s <strong>current</strong> club. Use after adding the migration so player profiles show which club
        they played for each season. Players without a club are skipped. &quot;Fill gaps only&quot; updates rows where
        the club is still empty; use overwrite only if you accept wrong clubs for past seasons after transfers.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run(false)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
          Fill gaps from current club
        </button>
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
        >
          Overwrite all stat rows (current club)
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-zinc-700">{message}</p>}
    </section>
  );
}

function ResetPeakMarketValueSection({
  onSuccess,
}: {
  onSuccess: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reset-peak-market-values", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Reset peak MV for ${data.updated} players (peak = current £).`);
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-zinc-900">
        <RotateCcw className="h-4 w-4 text-zinc-600" aria-hidden />
        <h3 className="text-sm font-semibold">Peak market value</h3>
      </div>
      <p className="mb-3 text-xs text-zinc-600">
        Sets every player&apos;s career peak MV to their <strong>current</strong> MV. Use after
        bad test data so rankings and profiles show a sensible peak from here on.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        Reset all peaks to current MV
      </button>
      {message && <p className="mt-2 text-xs text-zinc-700">{message}</p>}
    </section>
  );
}

function SyncMvHistoryForSeasonSection({
  seasons,
}: {
  seasons: { id: string; label: string }[];
}) {
  const sortedLabels = useMemo(
    () =>
      [...new Set(seasons.map((s) => s.label.trim()).filter(Boolean))].sort(compareSeasonLabelsDesc),
    [seasons],
  );
  const [seasonLabel, setSeasonLabel] = useState("");
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current || sortedLabels.length === 0) return;
    initRef.current = true;
    setSeasonLabel(sortedLabels.length >= 2 ? sortedLabels[1]! : sortedLabels[0]!);
  }, [sortedLabels]);

  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    const label = seasonLabel.trim();
    if (!label) {
      setMessage("Pick a season label.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sync-mv-history-for-season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel: label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(
        `Synced MV history for “${data.seasonLabel}”: ${data.rows ?? 0} player row(s). Each player’s graph point for that season now matches their current market value.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-200/90 bg-emerald-50/50 p-4 shadow-sm ring-1 ring-emerald-500/10">
      <div className="mb-2 flex items-center gap-2 text-zinc-900">
        <History className="h-4 w-4 text-emerald-700" aria-hidden />
        <h3 className="text-sm font-semibold text-emerald-950">Fix MV graph and prior-season trend</h3>
      </div>
      <p className="mb-3 text-xs text-zinc-600">
        Writes every player&apos;s <strong>current</strong> <code className="rounded bg-white px-1 font-mono text-[0.65rem]">market_value</code> into{" "}
        <code className="rounded bg-white px-1 font-mono text-[0.65rem]">player_market_value_history</code> for the
        season you pick. Use once to repair a past season if charts or &quot;vs last season&quot; looked wrong after
        international games (new sims keep this in sync automatically).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-zinc-700">
          Season label
          {sortedLabels.length > 0 ?
            <select
              value={seasonLabel}
              onChange={(e) => setSeasonLabel(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900"
            >
              {sortedLabels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          : <input
              value={seasonLabel}
              onChange={(e) => setSeasonLabel(e.target.value)}
              placeholder="e.g. Season 2"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900"
            />
          }
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={pending || !seasonLabel.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
          Sync history for season
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-zinc-700">{message}</p>}
    </section>
  );
}

const RESET_SIM_CONFIRM = "RESET_ALL_SIMULATION_DATA";

function ResetSimulationSection({
  onSuccess,
}: {
  onSuccess: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    if (typed !== RESET_SIM_CONFIRM) {
      setMessage(`Type ${RESET_SIM_CONFIRM} exactly to enable the button.`);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reset-simulation-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: RESET_SIM_CONFIRM }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(
        "Reset complete: all fixtures and saved matches removed, international competitions cleared, stats/transactions/awards wiped, club balances restored to defaults, players reset to baseline ratings/MV. Re-run Season maker and Generate international competitions to rebuild schedules.",
      );
      setTyped("");
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-red-950">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <h2 className="text-lg font-semibold">Reset simulation data</h2>
      </div>
      <p className="text-sm text-red-900/90">
        Deletes <strong>all club fixtures</strong>, <strong>saved match replays</strong>,{" "}
        <strong>Champions League tournament entries</strong>, and <strong>international competitions</strong> (groups,
        knockouts, and scores). Clears <strong>stats</strong>, <strong>season awards</strong>,{" "}
        <strong>international stats</strong>, <strong>national team call-ups</strong>, <strong>MV history</strong>, and{" "}
        <strong>team transactions</strong>. Resets every club&apos;s <strong>balance and budget</strong> to the default
        starting amount and all players to rating/OVR 50 with MV 0. Leagues, teams, and player rows remain — you must
        re-seed the calendar (Season maker, international generate, CL setup) before playing again.
      </p>
      <label className="mt-4 flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-800">
          Type <code className="rounded bg-white px-1 font-mono text-xs">{RESET_SIM_CONFIRM}</code> to confirm
        </span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        disabled={pending || typed !== RESET_SIM_CONFIRM}
        onClick={() => void run()}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Erase stats &amp; reset world
      </button>
      {message && <p className="mt-3 text-sm text-zinc-800">{message}</p>}
    </section>
  );
}

function InsolvencySection() {
  const [pending, setPending] = useState(false);
  const [threshold, setThreshold] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<
    { id: string; name: string; current_balance: number }[]
  >([]);

  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const t = threshold.trim() === "" ? "0" : threshold.trim();
      const res = await fetch(`/api/admin/insolvency?threshold=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRows(data.teams ?? []);
      setMessage(
        `${data.count ?? 0} team(s) below £${data.threshold?.toLocaleString?.() ?? t} balance.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
      setRows([]);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold">Insolvency watch</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Lists clubs with balance strictly below the threshold (default{" "}
        <code className="rounded bg-zinc-100 px-1">0</code> = any negative
        balance). Use the transfer market to sell players and raise cash.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Threshold (£)</span>
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            type="text"
            inputMode="decimal"
            className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          />
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Refresh list
        </button>
      </div>
      {message && <p className="mb-2 text-sm text-zinc-700">{message}</p>}
      {rows.length > 0 && (
        <ul className="max-h-48 overflow-auto rounded-lg border border-zinc-200 text-sm">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex justify-between border-b border-zinc-100 px-3 py-2 last:border-0"
            >
              <span className="font-medium text-zinc-900">{r.name}</span>
              <span className="tabular-nums text-red-700">
                £{Number(r.current_balance).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeasonAwardsSection({
  players,
  seasons,
}: {
  players: PlayerOption[];
  seasons: { id: string; label: string }[];
}) {
  const [seasonLabel, setSeasonLabel] = useState("");
  const [ballonId, setBallonId] = useState("");
  const [palmId, setPalmId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!seasonLabel.trim()) return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/season-awards?season=${encodeURIComponent(seasonLabel.trim())}`,
        );
        const data = await res.json();
        if (!res.ok) return;
        const list = (data.awards ?? []) as {
          award_type: string;
          player_id: string;
        }[];
        const ballon = list.find((a) => a.award_type === "ballon_dor");
        const palm = list.find((a) => a.award_type === "palm_dor");
        setBallonId(ballon?.player_id ?? "");
        setPalmId(palm?.player_id ?? "");
      } catch {
        /* ignore */
      }
    })();
  }, [seasonLabel]);

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      if (!seasonLabel.trim()) throw new Error("Pick a season");
      const res = await fetch("/api/admin/season-awards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonLabel: seasonLabel.trim(),
          ballonPlayerId: ballonId.trim() || null,
          palmPlayerId: palmId.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage("Awards saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(false);
    }
  }

  const strikers = players.filter((p) => p.role === "ST");
  const keepers = players.filter((p) => p.role === "GK");
  const ballonPick = strikers.find((p) => p.id === ballonId);
  const palmPick = keepers.find((p) => p.id === palmId);

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <Medal className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold">Season awards (manual)</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Ballon d&apos;Or: best outfield striker. Palm d&apos;Or: best goalkeeper. Clear a selection
        and save to remove that award for the season.
      </p>
      <div className="mb-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Season</span>
          <select
            value={seasonLabel}
            onChange={(e) => setSeasonLabel(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">Select season</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Ballon d&apos;Or (ST)</span>
          <div className="flex items-center gap-2">
            {ballonPick ?
              <PlayerAvatar
                name={ballonPick.name}
                profilePicUrl={ballonPick.profile_pic_url}
                sizeClassName="h-10 w-10"
              />
            : null}
            <select
              value={ballonId}
              onChange={(e) => setBallonId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">None</option>
              {strikers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Palm d&apos;Or (GK)</span>
          <div className="flex items-center gap-2">
            {palmPick ?
              <PlayerAvatar
                name={palmPick.name}
                profilePicUrl={palmPick.profile_pic_url}
                sizeClassName="h-10 w-10"
              />
            : null}
            <select
              value={palmId}
              onChange={(e) => setPalmId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">None</option>
              {keepers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={pending || !seasonLabel.trim()}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save awards
      </button>
      {message && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{message}</p>
      )}
    </section>
  );
}

function CLPayoutSection({ teams }: { teams: TeamOption[] }) {
  const [pending, setPending] = useState(false);
  const [seasonLabel, setSeasonLabel] = useState("");
  const [winnerId, setWinnerId] = useState("");
  const [runnerUpId, setRunnerUpId] = useState("");
  const [semi1, setSemi1] = useState("");
  const [semi2, setSemi2] = useState("");
  const [qf1, setQf1] = useState("");
  const [qf2, setQf2] = useState("");
  const [qf3, setQf3] = useState("");
  const [qf4, setQf4] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const semiLoserTeamIds = [...new Set([semi1, semi2].filter(Boolean))];
      const quarterFinalistTeamIds = [
        ...new Set([qf1, qf2, qf3, qf4].filter(Boolean)),
      ];
      const res = await fetch("/api/admin/cl-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(seasonLabel.trim() ? { seasonLabel: seasonLabel.trim() } : {}),
          winnerTeamId: winnerId,
          runnerUpTeamId: runnerUpId,
          ...(semiLoserTeamIds.length > 0 ? { semiLoserTeamIds } : {}),
          ...(quarterFinalistTeamIds.length > 0
            ? { quarterFinalistTeamIds }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(
        data.applied === false
          ? data.notes?.join(" ") ?? "Skipped."
          : `Paid. ${(data.notes ?? []).join(" ")}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <Trophy className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold">Champions League prize money</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        One payout batch per season (idempotent). Winner, runner-up, optional
        semi-finalists and quarter-finalists use amounts from{" "}
        <code className="rounded bg-zinc-100 px-1">economy.ts</code>.
      </p>
      <div className="mb-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Season label (optional)</span>
          <input
            value={seasonLabel}
            onChange={(e) => setSeasonLabel(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Winner</span>
            <select
              value={winnerId}
              onChange={(e) => setWinnerId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Runner-up</span>
            <select
              value={runnerUpId}
              onChange={(e) => setRunnerUpId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">
            Semi-final losers (optional)
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={semi1}
              onChange={(e) => setSemi1(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={semi2}
              onChange={(e) => setSemi2(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">
            Quarter-finalists (optional)
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={qf1}
              onChange={(e) => setQf1(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={qf2}
              onChange={(e) => setQf2(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={qf3}
              onChange={(e) => setQf3(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={qf4}
              onChange={(e) => setQf4(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">Select club…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending || !winnerId || !runnerUpId}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Apply CL payouts
      </button>
      {message && (
        <p className="mt-3 text-sm text-zinc-700">{message}</p>
      )}
    </section>
  );
}

function TransferMarketSection({
  teams,
  onSuccess,
}: {
  teams: TeamOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [playerId, setPlayerId] = useState("");
  const [toTeamId, setToTeamId] = useState("");
  const [fee, setFee] = useState("0");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/players");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (!cancelled) {
          setPlayers(Array.isArray(data) ? data : []);
          setLoadErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : "Load failed");
          setPlayers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const feeNum = parseFloat(fee);
      if (Number.isNaN(feeNum) || feeNum < 0) {
        throw new Error("Fee must be a non-negative number");
      }
      const res = await fetch("/api/admin/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          toTeamId,
          fee: feeNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Transfer failed");
      setMessage({
        ok: true,
        text: `Moved ${data.playerName} — fee £${Number(data.fee).toLocaleString()}`,
      });
      setPlayerId("");
      setToTeamId("");
      setFee("0");
      await onSuccess();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setPending(false);
    }
  }

  const selectedPlayer = players.find((p) => p.id === playerId);

  const feeNumParsed = useMemo(() => {
    const n = parseFloat(fee);
    if (Number.isNaN(n) || n < 0) return null;
    return Math.round(n);
  }, [fee]);

  const buyerAffordability = useMemo(() => {
    if (!selectedPlayer || !toTeamId || feeNumParsed === null) return null;
    if (selectedPlayer.team_id === toTeamId) return null;
    const buyer = teams.find((t) => t.id === toTeamId);
    if (!buyer) return null;
    const balance = Number(buyer.current_balance ?? 0);
    const buyerSquadMv = Number(buyer.squad_market_value ?? 0);
    const playerMv = Number(selectedPlayer.market_value ?? 0);
    const newSquadMv = buyerSquadMv + playerMv;
    const contractsNow = squadAnnualWageBill(buyerSquadMv);
    const contractsAfter = squadAnnualWageBill(newSquadMv);
    const balanceAfterFee = balance - feeNumParsed;
    const canPayFee = balance >= feeNumParsed;
    const canCoverContractsAfter = balanceAfterFee >= contractsAfter;
    return {
      balance,
      feeNumParsed,
      balanceAfterFee,
      buyerSquadMv,
      newSquadMv,
      contractsNow,
      contractsAfter,
      canPayFee,
      canCoverContractsAfter,
    };
  }, [selectedPlayer, toTeamId, feeNumParsed, teams]);

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <ArrowLeftRight className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">Transfer market (admin)</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Selling club receives the fee; buyer is debited. Free agents: only the
        buyer pays the fee (signing outlay).
      </p>
      {loadErr && (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {loadErr}
        </p>
      )}
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Player</span>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">Choose…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.team_id ? "" : " (free)"}
              </option>
            ))}
          </select>
        </label>
        {selectedPlayer && (
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-600">
            <PlayerAvatar
              name={selectedPlayer.name}
              profilePicUrl={selectedPlayer.profile_pic_url}
              sizeClassName="h-10 w-10"
            />
            <p>
              <span className="font-semibold text-zinc-800">{selectedPlayer.name}</span>
              <br />
              Market value £
              {Number(selectedPlayer.market_value ?? 0).toLocaleString()} ·{" "}
              {selectedPlayer.team_id ? "Contracted" : "Free agent"}
            </p>
          </div>
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Buyer club</span>
          <select
            value={toTeamId}
            onChange={(e) => setToTeamId(e.target.value)}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">Choose…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {typeof t.current_balance === "number"
                  ? ` (£${t.current_balance.toLocaleString()})`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Fee (£)</span>
          <input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            type="number"
            min={0}
            step={1000}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          />
        </label>
        {buyerAffordability && (
          <div
            className={`rounded-xl border px-3 py-3 text-xs ${
              buyerAffordability.canPayFee && buyerAffordability.canCoverContractsAfter
                ? "border-emerald-200 bg-emerald-50/80 text-zinc-800"
                : "border-red-200 bg-red-50/80 text-zinc-800"
            }`}
          >
            <p className="font-semibold text-zinc-900">Buyer before you confirm</p>
            <ul className="mt-2 space-y-1.5 text-zinc-700">
              <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  className={
                    buyerAffordability.canPayFee ? "font-semibold text-emerald-800" : "font-semibold text-red-700"
                  }
                >
                  {buyerAffordability.canPayFee ? "Can pay fee" : "Cannot pay fee"}
                </span>
                <span className="text-zinc-500">
                  (balance £{buyerAffordability.balance.toLocaleString()} vs fee £
                  {buyerAffordability.feeNumParsed.toLocaleString()})
                </span>
              </li>
              <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  className={
                    buyerAffordability.canCoverContractsAfter ?
                      "font-semibold text-emerald-800"
                    : "font-semibold text-red-700"
                  }
                >
                  {buyerAffordability.canCoverContractsAfter ?
                    "Cash after fee covers wage bill"
                  : "Cash after fee may not cover wage bill"}
                </span>
                <span className="text-zinc-500">
                  (50% of new squad MV ≈ £{buyerAffordability.contractsAfter.toLocaleString()} / yr; after fee £
                  {buyerAffordability.balanceAfterFee.toLocaleString()})
                </span>
              </li>
            </ul>
            <p className="mt-2 border-t border-zinc-200/80 pt-2 text-[0.7rem] text-zinc-500">
              Squad MV £{buyerAffordability.buyerSquadMv.toLocaleString()} → £
              {buyerAffordability.newSquadMv.toLocaleString()} · Annual wage bill (50%) £
              {buyerAffordability.contractsNow.toLocaleString()} → £
              {buyerAffordability.contractsAfter.toLocaleString()}
            </p>
          </div>
        )}
        {message && (
          <p
            className={
              message.ok
                ? "flex items-center gap-2 text-sm text-emerald-600"
                : "text-sm text-red-600"
            }
          >
            {message.ok && <Check className="h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !playerId || !toTeamId}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Complete transfer
        </button>
      </form>
    </section>
  );
}

function ReleasePlayerSection({
  players,
  onSuccess,
}: {
  players: PlayerOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [playerId, setPlayerId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const contractedPlayers = players.filter((p) => p.team_id);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Release ${players.find((p) => p.id === playerId)?.name ?? "this player"} to free agency?`)
    )
      return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/release-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage({ ok: true, text: `${data.playerName} released from ${data.fromTeam} to free agency.` });
      setPlayerId("");
      await onSuccess();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-zinc-900">
        <UserMinus className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold">Release player</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Releases a contracted player to free agency at no cost to the club. A &quot;release&quot; entry is logged
        in the club&apos;s transaction history. The player can then be picked up via Free Agency Pickup below.
      </p>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Player (contracted only)</span>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">Choose…</option>
            {contractedPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — MV £{Number(p.market_value ?? 0).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        {message && (
          <p className={message.ok ? "flex items-center gap-2 text-sm text-emerald-600" : "text-sm text-red-600"}>
            {message.ok && <Check className="h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !playerId}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
          Release to free agency
        </button>
      </form>
    </section>
  );
}

function FreeAgencyPickupSection({
  players,
  teams,
  onSuccess,
}: {
  players: PlayerOption[];
  teams: TeamOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [playerId, setPlayerId] = useState("");
  const [toTeamId, setToTeamId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const freeAgents = players.filter((p) => !p.team_id);
  const selectedPlayer = freeAgents.find((p) => p.id === playerId);
  const pickupFee = selectedPlayer
    ? Math.round(Number(selectedPlayer.market_value ?? 0) * 0.25)
    : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId || !toTeamId) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/free-agency-pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, toTeamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage({
        ok: true,
        text: `${data.playerName} picked up by ${data.toTeam} — fee £${Number(data.fee).toLocaleString()}`,
      });
      setPlayerId("");
      setToTeamId("");
      await onSuccess();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-zinc-900">
        <UserPlus className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">Free agency pickup</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Team signs a free agent by paying <strong>25% of their market value</strong> as a pickup fee. The fee is
        debited from the club&apos;s balance and logged as a &quot;free_agent_pickup&quot; transaction.
      </p>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Free agent</span>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">Choose…</option>
            {freeAgents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — MV £{Number(p.market_value ?? 0).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        {selectedPlayer && pickupFee !== null && (
          <p className="text-sm text-zinc-600">
            Pickup fee: <strong className="text-zinc-900">£{pickupFee.toLocaleString()}</strong> (25% of MV)
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Signing club</span>
          <select
            value={toTeamId}
            onChange={(e) => setToTeamId(e.target.value)}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">Choose…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {typeof t.current_balance === "number" ? ` (£${t.current_balance.toLocaleString()})` : ""}
              </option>
            ))}
          </select>
        </label>
        {message && (
          <p className={message.ok ? "flex items-center gap-2 text-sm text-emerald-600" : "text-sm text-red-600"}>
            {message.ok && <Check className="h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !playerId || !toTeamId}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Pick up free agent
        </button>
      </form>
    </section>
  );
}

function TrophyLibrarySection() {
  const [rows, setRows] = useState<TrophyDefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newSort, setNewSort] = useState("0");
  const [newCabinetScope, setNewCabinetScope] = useState("auto");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/trophy-definitions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRows(
        Array.isArray(data) ?
          (data as TrophyDefRow[]).map((row) => ({
            ...row,
            cabinet_scope: row.cabinet_scope ?? "auto",
          }))
        : [],
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchRow(id: string, patch: Partial<TrophyDefRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(r: TrophyDefRow) {
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/trophy-definitions/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: r.name.trim(),
          icon_url: r.icon_url?.trim() ? r.icon_url.trim() : null,
          sort_order: r.sort_order,
          cabinet_scope: r.cabinet_scope ?? "auto",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Saved “${data.name}”`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  async function deleteRow(id: string, label: string) {
    if (typeof window !== "undefined" && !window.confirm(`Delete trophy “${label}”?`))
      return;
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/trophy-definitions/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage("Deleted");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  async function createRow() {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/trophy-definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newSlug.trim(),
          name: newName.trim(),
          icon_url: newIcon.trim() || null,
          sort_order: parseInt(newSort, 10) || 0,
          cabinet_scope: newCabinetScope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Created “${data.name}”`);
      setNewSlug("");
      setNewName("");
      setNewIcon("");
      setNewSort("0");
      setNewCabinetScope("auto");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">Trophy library</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800"
        >
          Refresh
        </button>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Set a public image URL for each trophy type (PNG/SVG). Team and player honours resolve icons from here when you use the matching{" "}
        <code className="rounded bg-zinc-100 px-1 font-mono text-xs">trophy_slug</code>.{" "}
        <strong className="font-semibold text-zinc-800">Honour order</strong> fixes sort on team/player pages: leave{" "}
        <em className="not-italic">Auto</em> for shared types like “Domestic league title”, or pick a country / tier / CL when you add a
        competition-specific slug (e.g. FA Cup → England domestic cup; Ligue 1 → France top division).
      </p>
      {loading ?
        <p className="text-sm text-zinc-500">Loading…</p>
      : <ul className="space-y-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-zinc-600">{r.slug}</span>
                <button
                  type="button"
                  onClick={() => void deleteRow(r.id, r.name)}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-600">Name</span>
                  <input
                    value={r.name}
                    onChange={(e) => patchRow(r.id, { name: e.target.value })}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-medium text-zinc-600">Icon URL</span>
                  <input
                    value={r.icon_url ?? ""}
                    onChange={(e) => patchRow(r.id, { icon_url: e.target.value })}
                    placeholder="https://…"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-600">Sort</span>
                  <input
                    type="number"
                    value={r.sort_order}
                    onChange={(e) =>
                      patchRow(r.id, { sort_order: parseInt(e.target.value, 10) || 0 })
                    }
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-medium text-zinc-600">Honour order (club trophies)</span>
                  <select
                    value={r.cabinet_scope ?? "auto"}
                    onChange={(e) => patchRow(r.id, { cabinet_scope: e.target.value })}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    {TROPHY_CABINET_SCOPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => void saveRow(r)}
                className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Save row
              </button>
            </li>
          ))}
        </ul>
      }
      <div className="mt-6 border-t border-zinc-200 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">Add trophy type</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="slug (e.g. super_cup)"
            className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="Icon URL (optional)"
            className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs sm:col-span-2"
          />
          <input
            type="number"
            value={newSort}
            onChange={(e) => setNewSort(e.target.value)}
            placeholder="Sort order"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-zinc-600">Honour order (club trophies)</span>
            <select
              value={newCabinetScope}
              onChange={(e) => setNewCabinetScope(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              {TROPHY_CABINET_SCOPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={creating || !newSlug.trim() || !newName.trim()}
          onClick={() => void createRow()}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

/** Dropdown picker for the "Won with" field — clubs with logos + countries, falls back to free text. */
function WonWithPicker({
  value,
  onChange,
  teams,
  countries,
}: {
  value: string;
  onChange: (v: string) => void;
  teams: TeamOption[];
  countries: CountryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const matchedTeam = teams.find((t) => t.name === value);
  const matchedCountry = countries.find((c) => c.name === value);
  const q = search.toLowerCase();
  const filteredTeams = teams.filter((t) => t.name.toLowerCase().includes(q));
  const filteredCountries = countries.filter((c) => c.name.toLowerCase().includes(q));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="flex w-full items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm hover:bg-zinc-50"
      >
        {matchedTeam?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={matchedTeam.logo_url} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
        ) : matchedCountry ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-sm">
            {(matchedCountry as CountryOption & { flag_emoji?: string }).flag_emoji ?? "🏳️"}
          </span>
        ) : (
          <span className="h-5 w-5 shrink-0 rounded bg-zinc-100" />
        )}
        <span className="min-w-0 flex-1 truncate text-left text-zinc-800">
          {value || <span className="text-zinc-400">None</span>}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-100 p-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clubs or countries…"
              className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-50"
              >
                <span className="h-5 w-5 shrink-0 rounded bg-zinc-100" />
                — None / clear —
              </button>
            </li>

            {filteredTeams.length > 0 && (
              <>
                <li className="px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-zinc-400">
                  Clubs
                </li>
                {filteredTeams.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(t.name); setOpen(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${value === t.name ? "bg-zinc-100 font-semibold" : ""}`}
                    >
                      {t.logo_url ?
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logo_url} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                      : <span className="h-6 w-6 shrink-0 rounded bg-zinc-100" />}
                      <span className="min-w-0 truncate text-zinc-800">{t.name}</span>
                    </button>
                  </li>
                ))}
              </>
            )}

            {filteredCountries.length > 0 && (
              <>
                <li className="px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-zinc-400">
                  Countries / NT
                </li>
                {filteredCountries.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(c.name); setOpen(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${value === c.name ? "bg-zinc-100 font-semibold" : ""}`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-100 text-sm">
                        {(c as CountryOption & { flag_emoji?: string }).flag_emoji ?? "🏳️"}
                      </span>
                      <span className="min-w-0 truncate text-zinc-800">{c.name}</span>
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
          <div className="border-t border-zinc-100 p-2">
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Or type free text…"
              className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EditTeamSection({
  teams,
  leagues,
  countries,
  onSuccess,
}: {
  teams: TeamOption[];
  leagues: League[];
  countries: CountryOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [logo, setLogo] = useState("");
  const [balance, setBalance] = useState("");
  const [honourRows, setHonourRows] = useState<HonourEditRow[]>([]);
  const [trophySlugs, setTrophySlugs] = useState<{ slug: string; name: string }[]>(
    [],
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/trophy-definitions")
      .then((r) => r.json())
      .then((data: TrophyDefRow[]) => {
        if (Array.isArray(data)) {
          setTrophySlugs(
            data.map((d) => ({ slug: d.slug, name: d.name })),
          );
        }
      })
      .catch(() => setTrophySlugs([]));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHonourRows([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/admin/teams/${selectedId}`);
      const d = await res.json();
      if (!res.ok) return;
      setName(d.name ?? "");
      setCountry(d.country ?? "");
      setLeagueId(d.league_id ?? "");
      setLogo(d.logo_url ?? "");
      setBalance(String(d.current_balance ?? ""));
      setHonourRows(honourRowsFromTrophies(d.trophies));
    })();
  }, [selectedId]);

  async function save() {
    if (!selectedId) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/teams/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          country,
          league_id: leagueId || null,
          logo_url: logo || null,
          ...(balance.trim() ? { current_balance: parseFloat(balance) } : {}),
          trophies: serializeHonourRows(honourRows),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Updated ${data.name}`);
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  function addHonourRow() {
    setHonourRows((h) => [...h, { trophy_slug: "", season: "", custom_name: "", won_with: "" }]);
  }

  function removeHonourRow(i: number) {
    setHonourRows((h) => h.filter((_, j) => j !== i));
  }

  function patchHonourRow(i: number, patch: Partial<HonourEditRow>) {
    setHonourRows((h) => h.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">Edit team</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Country (optional)</option>
          {countries.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">No league</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.country} {l.division})
            </option>
          ))}
        </select>
        <input
          value={logo}
          onChange={(e) => setLogo(e.target.value)}
          placeholder="Logo URL"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="Current balance"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">Honours (trophy cabinet)</h3>
        <p className="mb-3 text-xs text-zinc-600">
          Pick a trophy type from the library (for icons) and the season label. Optional{" "}
          <strong>Won with</strong> shows on player/team pages next to the season (club name, or country / national
          team for international silverware). Leave type empty and use custom title only for one-off entries.
        </p>
        <ul className="space-y-3">
          {honourRows.map((row, i) => (
            <li
              key={`h-${i}`}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Trophy type</span>
                <select
                  value={row.trophy_slug}
                  onChange={(e) =>
                    patchHonourRow(i, { trophy_slug: e.target.value })
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="">— Custom title —</option>
                  {trophySlugs.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {!row.trophy_slug ?
                <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs">
                  <span className="font-medium text-zinc-600">Custom title</span>
                  <input
                    value={row.custom_name}
                    onChange={(e) =>
                      patchHonourRow(i, { custom_name: e.target.value })
                    }
                    placeholder="e.g. Friendly shield"
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                  />
                </label>
              : null}
              <label className="flex min-w-[6rem] flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Season</span>
                <input
                  value={row.season}
                  onChange={(e) => patchHonourRow(i, { season: e.target.value })}
                  placeholder="2025/26"
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 font-mono text-sm"
                />
              </label>
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Won with (optional)</span>
                <WonWithPicker
                  value={row.won_with}
                  onChange={(v) => patchHonourRow(i, { won_with: v })}
                  teams={teams}
                  countries={countries}
                />
              </div>
              <button
                type="button"
                onClick={() => removeHonourRow(i)}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50"
                aria-label="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addHonourRow}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add honour
        </button>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!selectedId}
        className="mt-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
      >
        Save team
      </button>
      {message && <p className="mt-2 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function EditPlayerSection({
  players,
  teams,
  countries,
  onSuccess,
}: {
  players: PlayerOption[];
  teams: TeamOption[];
  countries: CountryOption[];
  onSuccess: () => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState("");
  const [role, setRole] = useState("ST");
  const [age, setAge] = useState("24");
  const [mv, setMv] = useState("0");
  const [hiddenOvr, setHiddenOvr] = useState("50");
  const [teamId, setTeamId] = useState("free");
  const [profileUrl, setProfileUrl] = useState("");
  const [honourRows, setHonourRows] = useState<HonourEditRow[]>([]);
  const [trophySlugs, setTrophySlugs] = useState<{ slug: string; name: string }[]>(
    [],
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/trophy-definitions")
      .then((r) => r.json())
      .then((data: TrophyDefRow[]) => {
        if (Array.isArray(data)) {
          setTrophySlugs(
            data.map((d) => ({ slug: d.slug, name: d.name })),
          );
        }
      })
      .catch(() => setTrophySlugs([]));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHonourRows([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/admin/players/${selectedId}`);
      const p = await res.json();
      if (!res.ok) return;
      setName(p.name ?? "");
      setNationality(p.nationality ?? "");
      setRole((p.role as string) || "ST");
      setAge(String(p.age ?? 24));
      setMv(String(p.market_value ?? 0));
      setHiddenOvr(String(p.hidden_ovr ?? 50));
      setTeamId(p.team_id ?? "free");
      setProfileUrl((p.profile_pic_url as string | null) ?? "");
      setHonourRows(honourRowsFromTrophies(p.trophies));
    })();
  }, [selectedId]);

  async function save() {
    if (!selectedId) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/players/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nationality,
          role,
          age: parseInt(age, 10),
          market_value: parseFloat(mv),
          hidden_ovr: parseInt(hiddenOvr, 10),
          team_id: teamId === "free" ? null : teamId,
          profile_pic_url: profileUrl || null,
          trophies: serializeHonourRows(honourRows),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Updated ${data.name}`);
      await onSuccess();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    }
  }

  function addHonourRow() {
    setHonourRows((h) => [...h, { trophy_slug: "", season: "", custom_name: "", won_with: "" }]);
  }

  function removeHonourRow(i: number) {
    setHonourRows((h) => h.filter((_, j) => j !== i));
  }

  function patchHonourRow(i: number, patch: Partial<HonourEditRow>) {
    setHonourRows((h) => h.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  const editPick = players.find((x) => x.id === selectedId);

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">Edit player</h2>
      <div className="mb-3 flex items-center gap-3">
        {editPick ?
          <PlayerAvatar
            name={editPick.name}
            profilePicUrl={editPick.profile_pic_url}
            sizeClassName="h-11 w-11"
          />
        : null}
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="min-w-[12rem] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {editPick ?
        <p className="mb-3 text-xs text-zinc-600">
          <span className="font-semibold text-zinc-800">Career salary earned:</span> £
          {Number(editPick.career_salary_earned ?? 0).toLocaleString()}
          <span className="text-zinc-500">
            {" "}
            (50% of MV each time wages ran while on a club; see How it works)
          </span>
        </p>
      : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Nationality</option>
          {countries.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="free">Free agent</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="ST">ST</option>
          <option value="GK">GK</option>
        </select>
        <input
          value={age}
          onChange={(e) => setAge(e.target.value)}
          type="number"
          min={16}
          max={50}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          value={mv}
          onChange={(e) => setMv(e.target.value)}
          type="number"
          min={0}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          value={hiddenOvr}
          onChange={(e) => setHiddenOvr(e.target.value)}
          type="number"
          min={0}
          max={100}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          placeholder="Profile image URL"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
        />
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">Honours (trophy cabinet)</h3>
        <p className="mb-3 text-xs text-zinc-600">
          Extra silverware beyond automated awards. Uses the same trophy library as teams. Optional{" "}
          <strong>Won with</strong> appears next to the season on the player profile (club, or country / NT for
          international trophies).
        </p>
        <ul className="space-y-3">
          {honourRows.map((row, i) => (
            <li
              key={`ph-${i}`}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Trophy type</span>
                <select
                  value={row.trophy_slug}
                  onChange={(e) =>
                    patchHonourRow(i, { trophy_slug: e.target.value })
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="">— Custom title —</option>
                  {trophySlugs.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {!row.trophy_slug ?
                <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs">
                  <span className="font-medium text-zinc-600">Custom title</span>
                  <input
                    value={row.custom_name}
                    onChange={(e) =>
                      patchHonourRow(i, { custom_name: e.target.value })
                    }
                    placeholder="e.g. Olympic gold"
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                  />
                </label>
              : null}
              <label className="flex min-w-[6rem] flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Season</span>
                <input
                  value={row.season}
                  onChange={(e) => patchHonourRow(i, { season: e.target.value })}
                  placeholder="2025/26"
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 font-mono text-sm"
                />
              </label>
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">
                <span className="font-medium text-zinc-600">Won with (optional)</span>
                <WonWithPicker
                  value={row.won_with}
                  onChange={(v) => patchHonourRow(i, { won_with: v })}
                  teams={teams}
                  countries={countries}
                />
              </div>
              <button
                type="button"
                onClick={() => removeHonourRow(i)}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50"
                aria-label="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addHonourRow}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add honour
        </button>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!selectedId}
        className="mt-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
      >
        Save player
      </button>
      {message && <p className="mt-2 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}

function EditLeagueSection({
  leagues,
  onSaved,
}: {
  leagues: League[];
  onSaved: () => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = leagues.find((l) => l.id === selectedId);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [division, setDivision] = useState<"D1" | "D2">("D1");
  const [logoUrl, setLogoUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!selected) {
      setName("");
      setCountry("");
      setDivision("D1");
      setLogoUrl("");
      return;
    }
    setName(selected.name);
    setCountry(selected.country);
    setDivision(selected.division === "D2" ? "D2" : "D1");
    setLogoUrl(selected.logo_url ?? "");
  }, [selected]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/leagues/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          country: country.trim(),
          division,
          logo_url: logoUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMessage({ ok: true, text: `League “${data.name}” updated.` });
      await onSaved();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Failed to update league",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-zinc-900">
        <Globe2 className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">Edit league</h2>
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Select league
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
          >
            <option value="">Choose…</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {l.country}
              </option>
            ))}
          </select>
        </label>
        {selectedId && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-zinc-700">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-zinc-700">
                  Country
                </span>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  required
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700">
                Division
              </span>
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value as "D1" | "D2")}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
              >
                <option value="D1">D1</option>
                <option value="D2">D2</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700">
                Logo URL
              </span>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                type="url"
                placeholder="https://…"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
              />
            </label>
          </>
        )}
        {message && (
          <p
            className={
              message.ok
                ? "flex items-center gap-2 text-sm text-emerald-600"
                : "text-sm text-red-600"
            }
          >
            {message.ok && <Check className="h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !selectedId}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save league
        </button>
      </form>
    </section>
  );
}

import Link from "next/link";
import { BracketColumnConnector } from "@/components/bracket/BracketColumnConnector";
import { computeStandings, LEAGUE_STYLE_TIEBREAK_BLURB, type FixtureRow } from "@/lib/standings";
import { formatFixtureCalendarLabel } from "@/lib/calendarPhases";
import { TournamentGroupStageTable } from "@/components/TournamentGroupStageTable";
import { AetScoreLine } from "@/components/AetScoreLine";

export type ClFxLite = {
  id: string;
  week: number;
  cup_round: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team_id: string;
  away_team_id: string;
  score_detail?: { displayLine?: string } | null;
};

type TeamInfo = { name: string; logo_url: string | null };

function toRows(fixtures: ClFxLite[]): FixtureRow[] {
  return fixtures.map((f) => ({
    league_id: null,
    home_team_id: f.home_team_id,
    away_team_id: f.away_team_id,
    home_score: f.home_score,
    away_score: f.away_score,
    status: f.status,
  }));
}

function GroupBlock({
  label,
  fixtures,
  teamById,
  teamSaves,
}: {
  label: string;
  fixtures: ClFxLite[];
  teamById: Map<string, TeamInfo>;
  teamSaves?: Record<string, number>;
}) {
  if (fixtures.length === 0) return null;
  const ids = [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))];
  const table = computeStandings(ids, toRows(fixtures), {
    mode: "tournament",
    teamSaves,
  });
  return (
    <div className="overflow-hidden rounded-xl border border-sky-200/90 bg-white/90 shadow-sm">
      <div className="border-b border-sky-100 bg-sky-100/80 px-3 py-2 text-xs font-black uppercase tracking-wide text-sky-950">
        Group {label}
      </div>
      <div className="p-1">
        <TournamentGroupStageTable
          rows={table}
          renderTeam={(r) => {
            const t = teamById.get(r.teamId);
            return (
              <Link
                href={`/team/${r.teamId}`}
                className="inline-flex min-w-0 items-center gap-2 font-bold text-slate-900 hover:text-emerald-800 hover:underline"
              >
                {t?.logo_url ?
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo_url} alt="" className="h-6 w-6 shrink-0 rounded-md object-contain" />
                : null}
                <span className="min-w-0 break-words">{t?.name ?? r.teamId}</span>
              </Link>
            );
          }}
        />
      </div>
    </div>
  );
}

function ClKoTieCard({
  label,
  f,
  home,
  away,
}: {
  label: string;
  f: ClFxLite;
  home: TeamInfo | undefined;
  away: TeamInfo | undefined;
}) {
  const done =
    f.status === "completed" && f.home_score != null && f.away_score != null;
  const hs = f.home_score ?? 0;
  const as = f.away_score ?? 0;
  const hWin = done && hs > as;
  const aWin = done && as > hs;

  return (
    <div className="rounded-xl border border-indigo-200/90 bg-white px-3 py-3 shadow-sm ring-1 ring-indigo-100/60">
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-indigo-800">
        {label}
        <span className="ml-2 font-mono font-normal text-slate-400">
          {formatFixtureCalendarLabel(f.week, "champions_league")}
        </span>
      </p>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/team/${f.home_team_id}`}
            className={`inline-flex min-w-0 flex-1 items-center gap-2 break-words hover:text-emerald-800 hover:underline ${
              hWin ? "rounded-lg bg-emerald-100 px-2 py-1 font-bold text-emerald-950" : "text-slate-800"
            }`}
          >
            {home?.logo_url ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={home.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            : null}
            <span className="min-w-0">{home?.name ?? f.home_team_id}</span>
          </Link>
          {done ?
            <span className="shrink-0 font-mono text-lg font-black tabular-nums text-slate-800">{hs}</span>
          : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/team/${f.away_team_id}`}
            className={`inline-flex min-w-0 flex-1 items-center gap-2 break-words hover:text-emerald-800 hover:underline ${
              aWin ? "rounded-lg bg-emerald-100 px-2 py-1 font-bold text-emerald-950" : "text-slate-800"
            }`}
          >
            {away?.logo_url ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={away.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            : null}
            <span className="min-w-0">{away?.name ?? f.away_team_id}</span>
          </Link>
          {done ?
            <span className="shrink-0 font-mono text-lg font-black tabular-nums text-slate-800">{as}</span>
          : null}
        </div>
        <AetScoreLine line={f.score_detail?.displayLine} />
      </div>
      {f.status === "scheduled" ?
        <Link
          href={`/matchday?homeTeamId=${encodeURIComponent(f.home_team_id)}&awayTeamId=${encodeURIComponent(f.away_team_id)}&fixtureId=${encodeURIComponent(f.id)}`}
          className="mt-2 inline-flex text-xs font-bold text-emerald-700 hover:underline"
        >
          Open match center →
        </Link>
      : null}
    </div>
  );
}

/**
 * Group tables + SF → F bracket for Champions League club fixtures (same visual language as international knockouts).
 */
export function ChampionsLeagueTournamentBoard({
  fixtures,
  teamById,
  teamSaves,
}: {
  fixtures: ClFxLite[];
  teamById: Map<string, TeamInfo>;
  /** Season goalkeeper saves by team — used for tiebreak (same as league tables). */
  teamSaves?: Record<string, number>;
}) {
  const ga = fixtures.filter((f) => f.cup_round === "CL_GA");
  const gb = fixtures.filter((f) => f.cup_round === "CL_GB");
  const sf = fixtures
    .filter((f) => (f.cup_round ?? "").startsWith("CL_SF"))
    .sort((a, b) => (a.cup_round ?? "").localeCompare(b.cup_round ?? "") || a.week - b.week);
  const fin = fixtures.find((f) => f.cup_round === "CL_F");

  const hasGroups = ga.length > 0 || gb.length > 0;
  const hasKo = sf.length > 0 || !!fin;

  if (!hasGroups && !hasKo) return null;

  return (
    <div className="space-y-6">
      {hasGroups ?
        <div className="overflow-hidden rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50/95 via-white to-indigo-50/50 p-4 shadow-md ring-1 ring-sky-100/90">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200/60 pb-3">
            <h4 className="text-sm font-black uppercase tracking-wide text-sky-950">Group stage</h4>
            <span className="text-[0.65rem] font-semibold text-sky-800/90">Top two advance · single round-robin</span>
          </div>
          <p className="mt-2 text-[0.65rem] leading-snug text-sky-900/85">{LEAGUE_STYLE_TIEBREAK_BLURB}</p>
          <div className="mt-4 flex max-w-2xl flex-col gap-4">
            {ga.length > 0 ?
              <GroupBlock label="A" fixtures={ga} teamById={teamById} teamSaves={teamSaves} />
            : null}
            {gb.length > 0 ?
              <GroupBlock label="B" fixtures={gb} teamById={teamById} teamSaves={teamSaves} />
            : null}
          </div>
        </div>
      : null}

      {hasKo ?
        <div className="overflow-hidden rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50/80 p-4 shadow-md ring-1 ring-indigo-100/80">
          <div className="border-b border-indigo-200/60 pb-3">
            <h4 className="text-sm font-black uppercase tracking-wide text-indigo-950">Knockout bracket</h4>
            <p className="mt-1 text-[0.7rem] leading-relaxed text-indigo-900/85">
              Semi-finals (group winners vs other group runners-up) → final. Play ties in Matchday; scores update here.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-0">
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-4 lg:border-r lg:border-indigo-200 lg:pr-8">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Semi-finals</p>
              {sf.length === 0 ?
                <p className="text-sm text-slate-500">Complete the group stage to seed semi-finals.</p>
              : sf.map((fx, i) => (
                  <ClKoTieCard
                    key={fx.id}
                    label={fx.cup_round === "CL_SF1" ? "Semi-final 1" : fx.cup_round === "CL_SF2" ? "Semi-final 2" : `Semi ${i + 1}`}
                    f={fx}
                    home={teamById.get(fx.home_team_id)}
                    away={teamById.get(fx.away_team_id)}
                  />
                ))}
            </div>

            <div className="hidden lg:flex lg:items-center lg:px-2">
              <BracketColumnConnector />
            </div>
            <div className="lg:hidden">
              <div className="flex justify-center py-1 text-[0.65rem] font-bold uppercase tracking-wider text-indigo-400">
                ↓
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center lg:pl-4">
              <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Final</p>
              {fin ?
                <ClKoTieCard label="Final" f={fin} home={teamById.get(fin.home_team_id)} away={teamById.get(fin.away_team_id)} />
              : (
                <div className="rounded-xl border border-dashed border-indigo-200 bg-white/90 px-4 py-8 text-center text-sm text-slate-500">
                  The final appears after both semi-finals are complete.
                </div>
              )}
            </div>
          </div>
        </div>
      : null}
    </div>
  );
}

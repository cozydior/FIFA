import Link from "next/link";
import { BracketColumnConnector } from "@/components/bracket/BracketColumnConnector";
import { AetScoreLine } from "@/components/AetScoreLine";

export type RegionalCupFx = {
  id: string;
  week: number;
  cup_round: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team_id: string;
  away_team_id: string;
  /** Rich score line from knockout sim (e.g. `1-1 AET (2-1)`) */
  scoreDisplay?: string | null;
};

const ROUND_ORDER: Record<string, number> = {
  QF: 0,
  R16: 0,
  SF: 1,
  F: 2,
};

function roundLabel(r: string | null): string {
  if (!r) return "Match";
  const u = r.toUpperCase();
  if (u === "QF") return "Quarter-finals";
  if (u === "SF") return "Semi-finals";
  if (u === "F") return "Final";
  return r;
}

function TieCard(props: {
  f: RegionalCupFx;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
}) {
  const { f } = props;
  const done =
    f.status === "completed" &&
    f.home_score != null &&
    f.away_score != null;
  const hs = f.home_score ?? 0;
  const as = f.away_score ?? 0;
  const hWin = done && hs > as;
  const aWin = done && as > hs;
  const richLine = f.scoreDisplay?.trim();

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">
        <span className="font-mono text-slate-400">Week {f.week}</span>
      </p>
      <div className="mt-2 flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/team/${f.home_team_id}`}
            className={`inline-flex min-w-0 items-center gap-2 truncate hover:text-emerald-800 hover:underline ${
              hWin ? "rounded px-1.5 py-0.5 font-bold text-emerald-950 bg-emerald-100" : "text-slate-800"
            }`}
          >
            {props.homeLogo ?
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.homeLogo}
                alt=""
                className="h-7 w-7 shrink-0 rounded-md object-contain"
              />
            : null}
            <span className="truncate">{props.homeName}</span>
          </Link>
          {done ?
            <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
              {hs}
            </span>
          : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/team/${f.away_team_id}`}
            className={`inline-flex min-w-0 items-center gap-2 truncate hover:text-emerald-800 hover:underline ${
              aWin ? "rounded px-1.5 py-0.5 font-bold text-emerald-950 bg-emerald-100" : "text-slate-800"
            }`}
          >
            {props.awayLogo ?
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.awayLogo}
                alt=""
                className="h-7 w-7 shrink-0 rounded-md object-contain"
              />
            : null}
            <span className="truncate">{props.awayName}</span>
          </Link>
          {done ?
            <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
              {as}
            </span>
          : null}
        </div>
      </div>
      <AetScoreLine line={richLine} />
      {f.status === "scheduled" ?
        <Link
          href={`/matchday?homeTeamId=${f.home_team_id}&awayTeamId=${f.away_team_id}&fixtureId=${f.id}`}
          className="mt-2 inline-block text-xs font-bold text-emerald-700 hover:underline"
        >
          Match center →
        </Link>
      : null}
    </div>
  );
}

/** Same layout and styling as IntlKnockoutBracket: indigo shell, rounds as columns, connectors on large screens. */
export function RegionalCupBracket(props: {
  fixtures: RegionalCupFx[];
  teamName: Map<string, string>;
  teamLogo: Map<string, string | null>;
}) {
  const { fixtures, teamName, teamLogo } = props;
  if (fixtures.length === 0) return null;

  const byRound = new Map<string, RegionalCupFx[]>();
  for (const f of fixtures) {
    const key = (f.cup_round ?? "other").toUpperCase();
    if (!byRound.has(key)) byRound.set(key, []);
    byRound.get(key)!.push(f);
  }

  const rounds = [...byRound.entries()].sort((a, b) => {
    const oa = ROUND_ORDER[a[0]] ?? 99;
    const ob = ROUND_ORDER[b[0]] ?? 99;
    if (oa !== ob) return oa - ob;
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="rounded-xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/80 to-white p-4 shadow-sm">
      <h4 className="text-sm font-black uppercase tracking-wide text-indigo-950">
        Knockout bracket
      </h4>
      <p className="mt-1 text-[0.7rem] text-indigo-900/80">
        Rounds flow left to right; lines are decorative. Play each tie in <strong>Matchday</strong> (same 8-shot sim
        as league games).
      </p>

      <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-stretch md:gap-0">
        {rounds.flatMap(([roundKey, list], index) => {
          const sorted = [...list].sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
          const isLast = index === rounds.length - 1;
          const column = (
            <div
              key={roundKey}
              className={`flex min-w-0 flex-1 flex-col justify-center gap-4 ${
                !isLast ? "md:border-r md:border-indigo-200 md:pr-6" : ""
              }`}
            >
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
                {roundLabel(roundKey === "OTHER" ? null : roundKey)}
              </p>
              {sorted.map((f) => (
                <TieCard
                  key={f.id}
                  f={f}
                  homeName={teamName.get(f.home_team_id) ?? "Home"}
                  awayName={teamName.get(f.away_team_id) ?? "Away"}
                  homeLogo={teamLogo.get(f.home_team_id) ?? null}
                  awayLogo={teamLogo.get(f.away_team_id) ?? null}
                />
              ))}
            </div>
          );
          if (isLast) return [column];
          const connector = <BracketColumnConnector key={`${roundKey}-conn`} />;
          return [column, connector];
        })}
      </div>
    </div>
  );
}

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
  /** Season-maker / progression order within the round (QF1…QF4 feed SF slots). */
  sort_order?: number | null;
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

function DivisionBadge({ division }: { division: string }) {
  return (
    <span
      className="shrink-0 rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-700"
      title="League division"
    >
      {division}
    </span>
  );
}

function TieCard(props: {
  f: RegionalCupFx;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeDivision?: string | null;
  awayDivision?: string | null;
  slotLabel?: string;
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
        {props.slotLabel ?
          <span className="mr-2 rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-indigo-900">
            {props.slotLabel}
          </span>
        : null}
        <span className="font-mono text-slate-400">Week {f.week}</span>
      </p>
      <div className="mt-2 flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/team/${f.home_team_id}`}
            className={`inline-flex min-w-0 max-w-[min(100%,14rem)] flex-1 items-center gap-1.5 hover:text-emerald-800 hover:underline sm:max-w-none ${
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
            <span className="min-w-0 truncate">{props.homeName}</span>
            {props.homeDivision ? <DivisionBadge division={props.homeDivision} /> : null}
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
            className={`inline-flex min-w-0 max-w-[min(100%,14rem)] flex-1 items-center gap-1.5 hover:text-emerald-800 hover:underline sm:max-w-none ${
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
            <span className="min-w-0 truncate">{props.awayName}</span>
            {props.awayDivision ? <DivisionBadge division={props.awayDivision} /> : null}
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
  /** League division label per team (e.g. D1 / D2), same styling as Past winners. */
  teamDivision?: Map<string, string>;
}) {
  const { fixtures, teamName, teamLogo, teamDivision } = props;
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

  function sortInRound(a: RegionalCupFx, b: RegionalCupFx): number {
    const sa = a.sort_order ?? 0;
    const sb = b.sort_order ?? 0;
    if (sa !== sb) return sa - sb;
    if (a.week !== b.week) return a.week - b.week;
    return a.id.localeCompare(b.id);
  }

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
          const sorted = [...list].sort(sortInRound);
          const isLast = index === rounds.length - 1;
          const isQf = roundKey === "QF";
          const slotPrefix =
            roundKey === "QF" ? "QF"
            : roundKey === "SF" ? "SF"
            : roundKey === "F" ? "F"
            : "";
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
              <div
                className={
                  isQf ?
                    "grid grid-cols-1 gap-3 sm:grid-cols-2"
                  : "flex flex-col gap-4"
                }
              >
                {sorted.map((f, i) => (
                  <TieCard
                    key={f.id}
                    f={f}
                    slotLabel={slotPrefix ? `${slotPrefix}${i + 1}` : undefined}
                    homeName={teamName.get(f.home_team_id) ?? "Home"}
                    awayName={teamName.get(f.away_team_id) ?? "Away"}
                    homeLogo={teamLogo.get(f.home_team_id) ?? null}
                    awayLogo={teamLogo.get(f.away_team_id) ?? null}
                    homeDivision={teamDivision?.get(f.home_team_id) ?? null}
                    awayDivision={teamDivision?.get(f.away_team_id) ?? null}
                  />
                ))}
              </div>
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

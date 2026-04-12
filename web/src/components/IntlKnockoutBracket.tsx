import Link from "next/link";
import { BracketColumnConnector } from "@/components/bracket/BracketColumnConnector";
import { AetScoreLine } from "@/components/AetScoreLine";

export type IntlKoFixture = {
  id: string;
  week: number;
  stage: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home: string;
  away: string;
  homeFlag: string;
  awayFlag: string;
  homeCode: string | null;
  awayCode: string | null;
  /** Rich score line from knockout sim (e.g. `1-1 AET (2-1)`) */
  scoreDisplay?: string | null;
};

function Side(props: {
  flag: string;
  name: string;
  code: string | null;
  winner: boolean;
}) {
  const inner = (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 truncate rounded px-1.5 py-0.5 ${
        props.winner ? "bg-emerald-100 font-bold text-emerald-950" : "text-slate-800"
      }`}
    >
      <span className="shrink-0">{props.flag}</span>
      <span className="truncate">{props.name}</span>
    </span>
  );
  if (props.code) {
    return (
      <Link
        href={`/countries/${props.code}`}
        className="min-w-0 hover:text-emerald-800 hover:underline"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

function TieCard(props: { label: string; f: IntlKoFixture }) {
  const { f } = props;
  const done =
    f.status === "completed" &&
    f.home_score != null &&
    f.away_score != null;
  const hs = f.home_score ?? 0;
  const as = f.away_score ?? 0;
  const hWin = done && hs > as;
  const aWin = done && as > hs;
  const tie = done && hs === as;
  const richLine = f.scoreDisplay?.trim();

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">
        {props.label}
        <span className="ml-2 font-mono text-slate-400">W{f.week}</span>
      </p>
      <div className="mt-2 flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <Side
            flag={f.homeFlag}
            name={f.home}
            code={f.homeCode}
            winner={hWin}
          />
          {done ?
            <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
              {hs}
            </span>
          : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Side
            flag={f.awayFlag}
            name={f.away}
            code={f.awayCode}
            winner={aWin}
          />
          {done ?
            <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
              {as}
            </span>
          : null}
        </div>
      </div>
      <AetScoreLine line={richLine} />
    </div>
  );
}

/**
 * Compact two-column bracket: semi-finals feed a final (same layout as this app’s intl KO stages).
 */
export function IntlKnockoutBracket({ fixtures }: { fixtures: IntlKoFixture[] }) {
  const sf = fixtures
    .filter((x) => x.stage === "SF")
    .sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  const fin = fixtures.find((x) => x.stage === "F");

  if (sf.length === 0 && !fin) return null;

  return (
    <div className="rounded-xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/80 to-white p-4 shadow-sm">
      <h4 className="text-sm font-black uppercase tracking-wide text-indigo-950">
        Knockout bracket
      </h4>
      <p className="mt-1 text-[0.7rem] text-indigo-900/80">
        Semi-finals → final. Lines are decorative; scores come from <strong>Matchday</strong>. Knockout ties continue
        after 8 shots (extra time + sudden death) until there is a winner; the rich score line shows regulation vs
        final totals when available.
      </p>

      <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-stretch md:gap-0">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-4 md:border-r md:border-indigo-200 md:pr-6">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
            Semi-finals
          </p>
          {sf.length === 0 ?
            <p className="text-sm text-slate-500">No semi-final fixtures yet.</p>
          : sf.map((f, i) => (
              <TieCard key={f.id} label={`Semi ${i + 1}`} f={f} />
            ))}
        </div>

        <BracketColumnConnector />

        <div className="flex min-w-0 flex-1 flex-col justify-center md:pl-2">
          <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
            Final
          </p>
          {fin ?
            <TieCard label="Final" f={fin} />
          : <div className="rounded-lg border border-dashed border-indigo-200 bg-white/80 px-3 py-6 text-center text-sm text-slate-500">
              Final is scheduled after both semis are complete.
            </div>
          }
        </div>
      </div>
    </div>
  );
}

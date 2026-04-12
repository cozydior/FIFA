import type { ReactNode } from "react";
import type { StandingRow } from "@/lib/standings";
import { internationalGroupStandingRowClass } from "@/lib/internationalStandingsUi";

type RowLike = Pick<
  StandingRow,
  "teamId" | "played" | "won" | "drawn" | "lost" | "goalsFor" | "goalsAgainst" | "points"
>;

/**
 * Group-stage table — same columns as domestic league tables (P, W, D, L, GD, Pts).
 */
export function TournamentGroupStageTable({
  rows,
  renderTeam,
}: {
  rows: RowLike[];
  renderTeam: (row: RowLike, position: number) => ReactNode;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <th className="px-4 py-2.5">Pos</th>
          <th className="min-w-0 px-4 py-2.5">Team</th>
          <th className="px-4 py-2.5 text-center tabular-nums">P</th>
          <th className="px-4 py-2.5 text-center tabular-nums">W</th>
          <th className="px-4 py-2.5 text-center tabular-nums">D</th>
          <th className="px-4 py-2.5 text-center tabular-nums">L</th>
          <th className="px-4 py-2.5 text-right tabular-nums">GD</th>
          <th className="px-4 py-2.5 text-right tabular-nums">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const gd = r.goalsFor - r.goalsAgainst;
          return (
            <tr key={r.teamId} className={internationalGroupStandingRowClass(i)}>
              <td className="px-4 py-2.5 font-mono text-slate-500">{i + 1}</td>
              <td className="min-w-0 px-4 py-2.5">{renderTeam(r, i)}</td>
              <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{r.played}</td>
              <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{r.won}</td>
              <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{r.drawn}</td>
              <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{r.lost}</td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums text-slate-700 ${
                  gd > 0 ? "text-emerald-800" : gd < 0 ? "text-rose-800" : ""
                }`}
              >
                {gd > 0 ? `+${gd}` : gd}
              </td>
              <td className="px-4 py-2.5 text-right text-base font-extrabold tabular-nums text-slate-900">
                {r.points}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

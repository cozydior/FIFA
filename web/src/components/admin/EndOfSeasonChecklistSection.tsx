"use client";

import { useState } from "react";
import {
  ChevronDown,
  Landmark,
  ListChecks,
  Loader2,
  Trophy,
  Wallet,
} from "lucide-react";
import { formatApplyWagesResponseMessage } from "@/lib/formatApplyWagesMessage";

/**
 * Manual end-of-season flow: suggested order, optional “done” ticks (tracking only), one button per step.
 */
export function EndOfSeasonChecklistSection() {
  const [seasonLabel, setSeasonLabel] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [doneMv, setDoneMv] = useState(false);
  const [doneCl, setDoneCl] = useState(false);
  const [doneLeague, setDoneLeague] = useState(false);
  const [doneCup, setDoneCup] = useState(false);
  const [doneWages, setDoneWages] = useState(false);
  const [donePr, setDonePr] = useState(false);

  const [skipPayouts, setSkipPayouts] = useState(true);
  const [advanceSeason, setAdvanceSeason] = useState(true);
  const [seedChampionsLeague, setSeedChampionsLeague] = useState(false);

  const seasonBody = () =>
    seasonLabel.trim() ? { seasonLabel: seasonLabel.trim() } : {};

  async function runStep(key: string, fn: () => Promise<string>) {
    setPending(key);
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(null);
    }
  }

  async function runPromotionRelegation() {
    setPending("eos-pr");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/season-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...seasonBody(),
          skipLeaguePayouts: skipPayouts,
          advanceSeason,
          seedChampionsLeague,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const lp = data.leaguePayouts;
      const payoutLine =
        lp?.applied === false && lp?.notes?.[0]
          ? ` Payouts: ${lp.notes[0]}`
          : lp?.applied
            ? ` League prizes applied (${lp.notes?.length ?? 0} note(s)).`
            : "";
      const adv =
        data.nextSeasonLabel ?
          ` Current season is now ${data.nextSeasonLabel}.`
        : "";
      const clLine =
        data.championsLeagueSeeded ?
          ` CL seeded (${data.championsLeagueQualifiers} qualifiers in DB).`
        : ` CL DB not seeded (${data.championsLeagueQualifiers} slots computed).`;
      setMessage(
        `Promotion & relegation OK — moves: ${data.teamLeagueUpdates}.${clLine}${payoutLine}${adv}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(null);
    }
  }

  const stepBox =
    "rounded-xl border border-zinc-200/90 bg-white/90 px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50";
  const btnPr =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50";

  return (
    <section className="rounded-2xl border-2 border-emerald-200/90 bg-gradient-to-b from-emerald-50/60 via-white to-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-zinc-900">
        <ListChecks className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
        <h2 className="text-lg font-semibold">End of season checklist</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Suggested order below. Each step has its own button — nothing runs automatically. Optional
        &quot;Done&quot; checkboxes are only for your own tracking; you can run steps in any order.
      </p>

      <label className="mb-4 flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700">
          Season label (optional — uses current season setting if blank)
        </span>
        <input
          value={seasonLabel}
          onChange={(e) => setSeasonLabel(e.target.value)}
          placeholder="e.g. Season 1"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
        />
      </label>

      <ol className="flex list-none flex-col gap-4 p-0">
        <li className={stepBox}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500">Step 1</p>
              <p className="font-semibold text-zinc-900">Set player market values</p>
              <p className="mt-1 text-sm text-zinc-600">
                Recalculate £ from hidden OVR (goalkeepers use a lower curve). Wages below use 50% of squad MV.
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={doneMv}
                onChange={(e) => setDoneMv(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Done
            </label>
          </div>
          <button
            type="button"
            disabled={pending !== null}
            className={`${btn} mt-3`}
            onClick={() =>
              void runStep("eos-mv", async () => {
                const res = await fetch("/api/admin/set-market-values", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(seasonBody()),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed");
                return `MV set for ${data.updated} players (season snapshot: ${data.seasonLabel ?? "—"}).`;
              })
            }
          >
            {pending === "eos-mv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Run: set market values from OVR
          </button>
        </li>

        <li className={stepBox}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500">Step 2</p>
              <p className="font-semibold text-zinc-900">Champions League prize money</p>
              <p className="mt-1 text-sm text-zinc-600">
                Auto from the completed CL final fixture (idempotent). Use manual CL payout elsewhere if needed.
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={doneCl}
                onChange={(e) => setDoneCl(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Done
            </label>
          </div>
          <button
            type="button"
            disabled={pending !== null}
            className={`${btn} mt-3`}
            onClick={() =>
              void runStep("eos-cl", async () => {
                const res = await fetch("/api/admin/champions-league-payout-auto", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(seasonBody()),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed");
                return "Champions League payouts (from CL final fixture) processed.";
              })
            }
          >
            {pending === "eos-cl" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            Run: CL payouts (auto)
          </button>
        </li>

        <li className={stepBox}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500">Step 3</p>
              <p className="font-semibold text-zinc-900">Domestic league &amp; cup money</p>
              <p className="mt-1 text-sm text-zinc-600">
                League placement from final tables; regional cups from completed cup finals.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1 text-xs text-zinc-500">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={doneLeague}
                  onChange={(e) => setDoneLeague(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                League done
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={doneCup}
                  onChange={(e) => setDoneCup(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                Cups done
              </label>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending !== null}
              className={btn}
              onClick={() =>
                void runStep("eos-league", async () => {
                  const res = await fetch("/api/admin/league-payouts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(seasonBody()),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? "Failed");
                  const lp = data.leaguePayouts as { applied?: boolean; notes?: string[] };
                  if (lp?.applied === false && lp?.notes?.[0]) return lp.notes[0];
                  return `League placement prizes processed (${lp?.notes?.length ?? 0} line(s)).`;
                })
              }
            >
              {pending === "eos-league" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
              Run: league placement prizes
            </button>
            <button
              type="button"
              disabled={pending !== null}
              className={btn}
              onClick={() =>
                void runStep("eos-cup", async () => {
                  const res = await fetch("/api/admin/regional-cup-payouts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(seasonBody()),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? "Failed");
                  return "Regional cup final payouts processed.";
                })
              }
            >
              {pending === "eos-cup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              Run: regional cup finals
            </button>
          </div>
        </li>

        <li className={stepBox}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500">Step 4</p>
              <p className="font-semibold text-zinc-900">Pay season wages (50% squad MV)</p>
              <p className="mt-1 text-sm text-zinc-600">Charges each club based on current squad market values.</p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={doneWages}
                onChange={(e) => setDoneWages(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Done
            </label>
          </div>
          <button
            type="button"
            disabled={pending !== null}
            className={`${btn} mt-3`}
            onClick={() =>
              void runStep("eos-wages", async () => {
                const res = await fetch("/api/admin/apply-wages", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(seasonBody()),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed");
                return formatApplyWagesResponseMessage(data);
              })
            }
          >
            {pending === "eos-wages" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Run: pay wages (50%)
          </button>
        </li>

        <li className={stepBox}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500">Step 5</p>
              <p className="font-semibold text-zinc-900">Promotion &amp; relegation</p>
              <p className="mt-1 text-sm text-zinc-600">
                Applies division moves from completed league tables. Defaults match a typical close-out: skip duplicate
                league prize pass, advance the current season label.
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={donePr}
                onChange={(e) => setDonePr(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Done
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-sm text-zinc-700">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={skipPayouts}
                onChange={(e) => setSkipPayouts(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Skip league &amp; placement prize money (promotion/relegation still runs)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={advanceSeason}
                onChange={(e) => setAdvanceSeason(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Advance season (current → next label, e.g. Season N → Season N+1)
            </label>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="mt-1 flex items-center gap-1 self-start text-xs text-zinc-500 hover:text-zinc-800"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              Optional: Champions League DB seeding
            </button>
            {advancedOpen && (
              <label className="ml-5 flex cursor-pointer items-center gap-2 border-t border-zinc-200/80 pt-2 text-xs">
                <input
                  type="checkbox"
                  checked={seedChampionsLeague}
                  onChange={(e) => setSeedChampionsLeague(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                Also seed CL tournament entries for the season you are closing
              </label>
            )}
          </div>

          <button
            type="button"
            disabled={pending !== null}
            className={`${btnPr} mt-3`}
            onClick={() => void runPromotionRelegation()}
          >
            {pending === "eos-pr" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            Run: promotion &amp; relegation
          </button>
        </li>
      </ol>

      {message && (
        <p className="mt-4 whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
          {message}
        </p>
      )}
    </section>
  );
}

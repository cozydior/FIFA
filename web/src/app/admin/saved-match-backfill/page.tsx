"use client";

import { ArrowLeft, Loader2, Wrench } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type FixtureGap = {
  id: string;
  week: number;
  competition: string;
  cup_round: string | null;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
};

type Preview = {
  fixture: {
    id: string;
    season_label: string;
    week: number;
    competition: string;
    cup_round: string | null;
    home_team_id: string;
    away_team_id: string;
    home_score: number;
    away_score: number;
    score_detail: unknown;
  };
  split: { regH: number; regA: number; etH: number; etA: number };
  homeTeam: { id: string; name: string; logo_url: string | null };
  awayTeam: { id: string; name: string; logo_url: string | null };
  homeStrikers: { id: string; name: string }[];
  awayStrikers: { id: string; name: string }[];
  expectedHomeScorerCount: number;
  expectedAwayScorerCount: number;
};

export default function SavedMatchBackfillPage() {
  const [seasons, setSeasons] = useState<{ id: string; label: string }[]>([]);
  const [seasonLabel, setSeasonLabel] = useState("");
  const [gaps, setGaps] = useState<FixtureGap[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [homeScorers, setHomeScorers] = useState<string[]>([]);
  const [awayScorers, setAwayScorers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/seasons");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Seasons failed");
        setSeasons(data);
        if (Array.isArray(data) && data[0]?.label) {
          setSeasonLabel((prev) => prev || (data[0].label as string));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const loadGaps = useCallback(async () => {
    if (!seasonLabel.trim()) return;
    setListLoading(true);
    setListError(null);
    try {
      const q = new URLSearchParams({ seasonLabel: seasonLabel.trim() });
      const res = await fetch(`/api/admin/saved-match-backfill?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setGaps(data.fixtures ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed");
      setGaps([]);
    } finally {
      setListLoading(false);
    }
  }, [seasonLabel]);

  const loadPreview = useCallback(async (fixtureId: string) => {
    setSelectedFixtureId(fixtureId);
    setPreview(null);
    setPreviewError(null);
    setSavedMatchId(null);
    setSubmitError(null);
    setPreviewLoading(true);
    try {
      const q = new URLSearchParams({
        fixtureId,
        seasonLabel: seasonLabel.trim(),
      });
      const res = await fetch(`/api/admin/saved-match-backfill?${q}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && typeof data.existingSavedMatchId === "string") {
          throw new Error(
            `Replay already exists (open /matches/${data.existingSavedMatchId}).`,
          );
        }
        throw new Error(data.error ?? "Preview failed");
      }
      const p = data as Preview;
      setPreview(p);
      const h0 = p.homeStrikers[0]?.id ?? "";
      const a0 = p.awayStrikers[0]?.id ?? "";
      setHomeScorers(Array.from({ length: p.expectedHomeScorerCount }, () => h0));
      setAwayScorers(Array.from({ length: p.expectedAwayScorerCount }, () => a0));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [seasonLabel]);

  const splitSummary = useMemo(() => {
    if (!preview) return "";
    const { split } = preview;
    if (split.etH === 0 && split.etA === 0) {
      return `Regulation: ${split.regH}–${split.regA} (all goals in regulation).`;
    }
    return `Regulation ${split.regH}–${split.regA}; extra time +${split.etH}/+${split.etA}.`;
  }, [preview]);

  const onSubmit = async () => {
    if (!selectedFixtureId) return;
    setSubmitting(true);
    setSubmitError(null);
    setSavedMatchId(null);
    try {
      const res = await fetch("/api/admin/saved-match-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: selectedFixtureId,
          homeScorerIds: homeScorers,
          awayScorerIds: awayScorers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSavedMatchId(data.savedMatchId as string);
      void loadGaps();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to admin
        </Link>
      </div>

      <header className="mb-8 flex items-start gap-4 border-b border-slate-300/80 pb-8">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-orange-800 text-white shadow-md">
          <Wrench className="h-7 w-7" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Saved match backfill
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Completed fixtures in Supabase that never got a{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">saved_sim_matches</code> row
            (for example after a glitch during persist). Pick a game, assign each goal to a striker,
            and we generate a minimal shot log plus lineups from current club squads so the replay page
            works again.
          </p>
        </div>
      </header>

      <section className="mb-10 rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          1. Season &amp; gaps
        </h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Season label</span>
            <input
              type="text"
              value={seasonLabel}
              onChange={(e) => setSeasonLabel(e.target.value)}
              list="admin-backfill-seasons"
              placeholder="e.g. 2026/27"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
            />
            <datalist id="admin-backfill-seasons">
              {seasons.map((s) => (
                <option key={s.id} value={s.label} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            onClick={() => void loadGaps()}
            disabled={listLoading || !seasonLabel.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {listLoading ?
              <Loader2 className="h-4 w-4 animate-spin" />
            : null}
            Load fixtures missing replay
          </button>
        </div>
        {listError && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {listError}
          </p>
        )}
        {gaps.length === 0 && !listLoading && !listError && seasonLabel && (
          <p className="mt-4 text-sm text-slate-600">
            No completed fixtures in this season are missing a saved match link.
          </p>
        )}
        {gaps.length > 0 && (
          <ul className="mt-4 max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
            {gaps.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => void loadPreview(g.id)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
                    selectedFixtureId === g.id ? "bg-emerald-50" : ""
                  }`}
                >
                  <span className="font-semibold text-slate-900">
                    Wk {g.week} · {g.competition}
                    {g.cup_round ? ` · ${g.cup_round}` : ""}
                  </span>
                  <span className="text-slate-700">
                    {g.home_team_name} {g.home_score}–{g.away_score} {g.away_team_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-300/90 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          2. Assign scorers &amp; save
        </h2>
        {!selectedFixtureId && (
          <p className="mt-4 text-sm text-slate-600">Select a fixture from the list above.</p>
        )}
        {previewLoading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fixture…
          </p>
        )}
        {previewError && (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {previewError}
          </p>
        )}
        {preview && !previewLoading && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-700">
              <strong>
                {preview.homeTeam.name} {preview.fixture.home_score}–{preview.fixture.away_score}{" "}
                {preview.awayTeam.name}
              </strong>
              <span className="ml-2 font-mono text-xs text-slate-500">{preview.fixture.id}</span>
            </p>
            <p className="text-sm text-slate-600">{splitSummary}</p>
            <p className="text-xs leading-relaxed text-slate-500">
              Order lists <strong>your team&apos;s goals only</strong> in chronological order (first home
              goal, second home goal, …). The tool maps them onto alternating shots; it is a
              reconstruction, not the original sim timeline.
            </p>

            {preview.expectedHomeScorerCount > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Home goals ({preview.expectedHomeScorerCount})
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {homeScorers.map((val, i) => (
                    <label key={`h-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-28 text-slate-600">Home goal {i + 1}</span>
                      <select
                        value={val}
                        onChange={(e) => {
                          const next = [...homeScorers];
                          next[i] = e.target.value;
                          setHomeScorers(next);
                        }}
                        className="rounded-lg border border-slate-300 px-2 py-1.5"
                      >
                        {preview.homeStrikers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {preview.expectedAwayScorerCount > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Away goals ({preview.expectedAwayScorerCount})
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {awayScorers.map((val, i) => (
                    <label key={`a-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-28 text-slate-600">Away goal {i + 1}</span>
                      <select
                        value={val}
                        onChange={(e) => {
                          const next = [...awayScorers];
                          next[i] = e.target.value;
                          setAwayScorers(next);
                        }}
                        className="rounded-lg border border-slate-300 px-2 py-1.5"
                      >
                        {preview.awayStrikers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {preview.expectedHomeScorerCount === 0 && preview.expectedAwayScorerCount === 0 && (
              <p className="text-sm text-slate-600">0–0 — no scorers to assign.</p>
            )}

            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
            >
              {submitting ?
                <Loader2 className="h-4 w-4 animate-spin" />
              : null}
              Create saved match row
            </button>
            {submitError && (
              <p className="text-sm text-red-700" role="alert">
                {submitError}
              </p>
            )}
            {savedMatchId && (
              <p className="text-sm text-emerald-800">
                Saved.{" "}
                <Link
                  href={`/matches/${savedMatchId}`}
                  className="font-semibold underline hover:no-underline"
                >
                  Open replay →
                </Link>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

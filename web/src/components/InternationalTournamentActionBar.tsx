"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Slug = "nations_league" | "gold_cup" | "world_cup";

const LABEL: Record<Slug, string> = {
  nations_league: "Nations League",
  gold_cup: "Gold Cup",
  world_cup: "World Cup",
};

export function InternationalTournamentActionBar({
  slug,
  seasonLabel,
  previewEnabled,
  className,
}: {
  slug: Slug;
  seasonLabel: string;
  previewEnabled: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [gatesLoading, setGatesLoading] = useState(true);
  const [canStart, setCanStart] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    setGatesLoading(true);
    const q = new URLSearchParams({ seasonLabel });
    fetch(`/api/competitions/international/gates?${q}`)
      .then((r) => r.json())
      .then(
        (d: {
          nationsLeagueOrGoldCup?: { ok: boolean; reason?: string };
          worldCupDraw?: { ok: boolean; reason?: string };
        }) => {
          if (c) return;
          const g =
            slug === "world_cup" ? d.worldCupDraw : d.nationsLeagueOrGoldCup;
          setCanStart(g?.ok === true);
          setReason(g?.ok === false ? (g.reason ?? null) : null);
        },
      )
      .catch(() => {})
      .finally(() => {
        if (!c) setGatesLoading(false);
      });
    return () => {
      c = true;
    };
  }, [seasonLabel, slug]);

  const genLabel =
    slug === "world_cup" ? "Draw World Cup groups" : `Generate ${LABEL[slug]}`;

  async function startTournament() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/competitions/international/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel, slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg("Done — reloading.");
      window.location.href = `/competitions/international/${slug}?season=${encodeURIComponent(seasonLabel)}`;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function previewBootstrap() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/international-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel, slug, action: "bootstrap" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg("Preview bootstrap OK — reloading.");
      window.location.href = `/competitions/international/${slug}?season=${encodeURIComponent(seasonLabel)}`;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function fakeStage(stage: "group" | "SF" | "F") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/international-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel, slug, action: "fake_stage", stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg(`Fake ${stage}: completed ${data.completed ?? 0} — reloading.`);
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const seasonQ = encodeURIComponent(seasonLabel);

  return (
    <div
      className={`mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm shadow-sm ${className ?? ""}`}
    >
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Tournament</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/competitions/international/${slug}?season=${seasonQ}`}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
        >
          Open {LABEL[slug]} →
        </Link>
        <button
          type="button"
          disabled={busy || gatesLoading || !canStart}
          title={reason ?? undefined}
          onClick={() => void startTournament()}
          className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
        >
          {gatesLoading ? "Checking gates…" : genLabel}
        </button>
      </div>
      {!gatesLoading && reason ?
        <p className="text-xs text-amber-900">{reason}</p>
      : null}
      {!previewEnabled ?
        <p className="border-t border-slate-200/90 pt-2 text-[0.65rem] leading-relaxed text-slate-600">
          Want <strong className="text-slate-800">preview bootstrap</strong> and{" "}
          <strong className="text-slate-800">fake stages</strong>? Turn on{" "}
          <strong className="text-slate-800">Sim preview test mode</strong> in Admin → Season (saved per toggle).
        </p>
      : null}
      {previewEnabled ?
        <div className="border-t border-amber-200/80 pt-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-amber-900">Preview (Admin test mode)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void previewBootstrap()}
              className="rounded-md bg-amber-800 px-2 py-1 text-[0.65rem] font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
            >
              Preview bootstrap (bypass gates)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void fakeStage("group")}
              className="rounded-md bg-amber-700 px-2 py-1 text-[0.65rem] font-semibold text-white disabled:opacity-50"
            >
              Fake: finish groups
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void fakeStage("SF")}
              className="rounded-md bg-amber-700 px-2 py-1 text-[0.65rem] font-semibold text-white disabled:opacity-50"
            >
              Fake: finish semis
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void fakeStage("F")}
              className="rounded-md bg-amber-700 px-2 py-1 text-[0.65rem] font-semibold text-white disabled:opacity-50"
            >
              Fake: finish final
            </button>
          </div>
        </div>
      : null}
      {msg ? <p className="text-xs text-slate-700">{msg}</p> : null}
    </div>
  );
}

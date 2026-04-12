"use client";

import { useState } from "react";

export function InternationalCompetitionClient({
  slug,
  seasonLabel,
}: {
  slug: "nations_league" | "gold_cup" | "world_cup";
  seasonLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function simulate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/competitions/international/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, seasonLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`Simulated ${data.completed ?? 0} fixtures.`);
      location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      <p className="text-sm text-slate-600">
        Use <strong>Start tournament</strong> above when requirements are met. Play ties in{" "}
        <strong>Dashboard → Next up</strong>, or batch-resolve every scheduled match below.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void simulate()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Sim all fixtures
        </button>
        {message && <span className="text-sm text-slate-700">{message}</span>}
      </div>
    </div>
  );
}

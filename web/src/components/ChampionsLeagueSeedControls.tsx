"use client";

import { useEffect, useState } from "react";

export function ChampionsLeagueSeedControls({ seasonLabel }: { seasonLabel: string }) {
  const [previewUi, setPreviewUi] = useState(false);
  const [tournamentsMode, setTournamentsMode] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    Promise.all([
      fetch("/api/admin/sim-preview-test-mode").then((r) => r.json()),
      fetch("/api/admin/tournaments-mode").then((r) => r.json()),
    ])
      .then(([a, b]: [{ enabled?: boolean }, { enabled?: boolean }]) => {
        if (!c) {
          setPreviewUi(!!a.enabled);
          setTournamentsMode(!!b.enabled);
        }
      })
      .catch(() => {})
      .finally(() => {});
    return () => {
      c = true;
    };
  }, []);

  async function seed(mode: "production" | "preview") {
    setPending(mode);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/champions-league-seed-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const semiNote =
        typeof data.semisInserted === "number" && data.semisInserted > 0 ?
          ` Semis re-seeded: ${data.semisInserted}.`
        : typeof data.semisDeleted === "number" && data.semisDeleted > 0 && data.semisInserted === 0 ?
          " Old knockouts cleared (finish the group stage to create semis)."
        : "";
      setMessage(
        mode === "production" ?
          `Seeded CL (${data.groupFixturesInserted ?? 0} group fixtures).${semiNote} Refreshing…`
        : `Preview seed: ${data.groupFixturesInserted ?? 0} group fixtures.${semiNote} Refreshing…`,
      );
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function refreshSemis() {
    setPending("refresh_semis");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/champions-league-refresh-semis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const ins = data.inserted ?? 0;
      const del = data.deleted ?? 0;
      setMessage(
        `Refresh semis: removed ${del} knockout row(s), created ${ins} semi(s). Refreshing…`,
      );
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function previewAction(action: string) {
    setPending(action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/champions-league-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMessage(`${action}: ok (${JSON.stringify(data)}). Refreshing…`);
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {tournamentsMode ?
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!pending}
              onClick={() => void seed("production")}
              className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {pending === "production" ? "Seeding…" : "Seed CL (season rules)"}
            </button>
            {previewUi ?
              <button
                type="button"
                disabled={!!pending}
                onClick={() => void seed("preview")}
                className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {pending === "preview" ? "Seeding…" : "Preview seed (bypass gates)"}
              </button>
            : null}
            <button
              type="button"
              disabled={!!pending}
              onClick={() => void refreshSemis()}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-950 hover:bg-indigo-100 disabled:opacity-50"
            >
              {pending === "refresh_semis" ? "Refreshing…" : "Refresh semis"}
            </button>
          </div>
          <p className="text-xs text-slate-600">
            <strong>Season rules</strong> requires all league fixtures finished. <strong>Preview seed</strong> also needs
            Admin → <strong>Sim preview test mode</strong>.{" "}
            <strong>Refresh semis</strong> deletes CL semi + final rows for this season and rebuilds semis from group
            tables when the group stage is fully complete.
          </p>
        </>
      : (
        <p className="text-xs text-slate-600">
          <strong>Tournament seed controls are hidden.</strong> Turn on{" "}
          <strong>Tournaments mode</strong> in Admin → Season to show Seed CL, Preview seed, and Refresh semis.
        </p>
      )}

      {previewUi ?
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-amber-950">Preview: jump through stages</p>
          <p className="mt-1 text-[0.65rem] text-amber-950/90">
            Requires Sim preview test mode. Does not require Tournaments mode.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["fake_groups", "Complete groups (fake)"],
                ["seed_knockouts", "Create semis from tables"],
                ["fake_semis", "Complete semis (fake)"],
                ["insert_final", "Insert final"],
                ["fake_final", "Complete final (fake)"],
              ] as const
            ).map(([action, label]) => (
              <button
                key={action}
                type="button"
                disabled={!!pending}
                onClick={() => void previewAction(action)}
                className="rounded-md bg-amber-800/90 px-2 py-1 text-[0.65rem] font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
              >
                {pending === action ? "…" : label}
              </button>
            ))}
          </div>
        </div>
      : null}

      {message ? <p className="text-xs text-slate-700">{message}</p> : null}
    </div>
  );
}

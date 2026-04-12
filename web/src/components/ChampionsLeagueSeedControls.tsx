"use client";

import { useEffect, useState } from "react";

export function ChampionsLeagueSeedControls({ seasonLabel }: { seasonLabel: string }) {
  const [previewUi, setPreviewUi] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    fetch("/api/admin/sim-preview-test-mode")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => {
        if (!c) setPreviewUi(!!d.enabled);
      })
      .catch(() => {});
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
      setMessage(
        mode === "production" ?
          `Seeded CL (${data.groupFixturesInserted ?? 0} group fixtures). Refreshing…`
        : `Preview seed: ${data.groupFixturesInserted ?? 0} group fixtures. Refreshing…`,
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
      </div>
      <p className="text-xs text-slate-600">
        <strong>Season rules</strong> requires all league fixtures finished. <strong>Preview seed</strong> only appears when
        Admin → Season → <strong>Sim preview test mode</strong> is on.
      </p>

      {previewUi ?
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-amber-950">Preview: jump through stages</p>
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

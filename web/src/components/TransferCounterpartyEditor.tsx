"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TeamOpt = { id: string; name: string };

export function TransferCounterpartyEditor({
  transactionId,
  initialTeamId,
  teams,
}: {
  transactionId: string;
  initialTeamId: string | null;
  teams: TeamOpt[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialTeamId ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/team-transactions/${transactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterparty_team_id: value.trim() ? value.trim() : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? res.statusText);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1 border-t border-dashed border-slate-200 pt-2 sm:flex-row sm:items-center sm:gap-2">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">
        Other club (manual)
        <select
          className="max-w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
        >
          <option value="">— None —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {err ?
        <p className="text-xs font-semibold text-red-600">{err}</p>
      : null}
    </div>
  );
}

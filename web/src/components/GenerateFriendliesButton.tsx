"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateFriendliesButton({ seasonLabel }: { seasonLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/international/friendlies/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg("Friendlies generated.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy || !seasonLabel.trim()}
        onClick={onClick}
        className="inline-flex w-fit rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
      >
        {busy ? "Generating…" : "Generate friendlies"}
      </button>
      {msg ?
        <p className={`text-sm ${msg.startsWith("Friendlies") ? "text-emerald-800" : "text-red-700"}`}>{msg}</p>
      : null}
    </div>
  );
}

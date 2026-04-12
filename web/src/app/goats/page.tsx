import type { Metadata } from "next";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { Sparkles, TreePalm } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  buildGoatTallies,
  fetchGoatHistory,
  type GoatWinner,
} from "@/lib/goatsData";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "GOATs · Ballon d'Or & Palm d'Or",
  description:
    "Hall of honour: season winners for the Ballon d'Or (striker) and Palm d'Or (goalkeeper) awards.",
};

const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

function StatLine({ w }: { w: GoatWinner }) {
  const isSt = w.awardType === "ballon_dor";
  const primary = isSt ? w.goals : w.saves;
  const primaryLabel = isSt ? "Goals" : "Saves";
  return (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem] tabular-nums text-stone-400">
      <span>
        <span className="font-semibold text-amber-100/90">{primary}</span>{" "}
        <span className="text-stone-500">{primaryLabel}</span>
      </span>
      <span>
        <span className="font-semibold text-stone-200">{w.appearances}</span>{" "}
        <span className="text-stone-500">appearances</span>
      </span>
    </p>
  );
}

function WinnerBlock({
  kind,
  winner,
}: {
  kind: "ballon_dor" | "palm_dor";
  winner: GoatWinner | null;
}) {
  const isBallon = kind === "ballon_dor";
  const Icon = isBallon ? Sparkles : TreePalm;
  const label = isBallon ? "Ballon d'Or" : "Palm d'Or";
  const blurb = isBallon ? "Outfield · striker" : "Goalkeeper";
  const ring = isBallon
    ? "from-amber-200/25 via-amber-400/10 to-transparent"
    : "from-sky-200/20 via-cyan-400/10 to-transparent";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm`}
    >
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${ring} blur-2xl`}
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 ${
            isBallon ? "text-amber-200/90" : "text-cyan-200/90"
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-stone-500">
            {label}
          </p>
          <p className="text-xs text-stone-500">{blurb}</p>
        </div>
      </div>

      {winner ?
        <div className="relative mt-5 flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
          <PlayerAvatar
            name={winner.playerName}
            profilePicUrl={winner.profilePicUrl}
            sizeClassName="h-20 w-20 sm:h-[5.5rem] sm:w-[5.5rem]"
            textClassName="text-2xl"
          />
          <div className="mt-4 min-w-0 flex-1 sm:ml-5 sm:mt-0">
            <Link
              href={`/player/${winner.playerId}`}
              className={`block font-semibold tracking-tight text-stone-50 transition hover:text-amber-100 ${
                display.className
              } text-xl sm:text-2xl`}
            >
              {winner.playerName}
            </Link>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {winner.team ?
                <Link
                  href={`/team/${winner.team.id}`}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm text-stone-200 transition hover:border-amber-400/30 hover:bg-white/10"
                >
                  {winner.team.logoUrl ?
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={winner.team.logoUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full border border-white/10 bg-white object-contain p-0.5"
                    />
                  : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-700 text-xs font-bold text-stone-300">
                      {winner.team.name.slice(0, 1)}
                    </span>}
                  <span className="truncate font-medium">{winner.team.name}</span>
                </Link>
              : <span className="rounded-full border border-amber-900/40 bg-amber-950/40 px-3 py-1 text-sm font-medium text-amber-200/90">
                  Free agent
                </span>}
            </div>
            <StatLine w={winner} />
          </div>
        </div>
      : <p className="relative mt-6 text-center text-sm italic text-stone-500 sm:text-left">
          Not awarded this season.
        </p>}
    </div>
  );
}

export default async function GoatsPage() {
  let rows: Awaited<ReturnType<typeof fetchGoatHistory>> = [];
  let err: string | null = null;
  try {
    rows = await fetchGoatHistory();
  } catch (e) {
    err = e instanceof Error ? e.message : "Could not load awards.";
  }

  return (
    <div className="relative min-h-[calc(100vh-8rem)] overflow-hidden bg-[#0a0908] text-stone-200">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_-15%,rgba(212,175,55,0.14),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_50%,rgba(120,180,220,0.06),transparent_50%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-14 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] text-amber-200/70">
            Hall of honour
          </p>
          <h1
            className={`mt-3 bg-gradient-to-b from-amber-100 via-amber-200 to-amber-600/90 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl ${display.className}`}
          >
            The GOATs
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-stone-400">
            Season champions for the Ballon d&apos;Or (best striker) and Palm d&apos;Or (best
            goalkeeper). Stats are for the winning season; club shows current squad affiliation.
          </p>
        </header>

        {err ?
          <p className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-center text-sm text-red-200">
            {err}
          </p>
        : <>
            {rows.length > 0 ?
              (() => {
                const { ballon: ballonTally, palm: palmTally } = buildGoatTallies(rows);
                if (ballonTally.length === 0 && palmTally.length === 0) return null;
                return (
                  <div className="mb-12 grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-stone-950/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-amber-200/80">
                        Ballon d&apos;Or · career tally
                      </p>
                      {ballonTally.length === 0 ?
                        <p className="mt-4 text-sm text-stone-500">No Ballon winners on record yet.</p>
                      : <ol className="mt-4 space-y-3">
                        {ballonTally.map((t, i) => (
                          <li key={t.playerId}>
                            <Link
                              href={`/player/${t.playerId}`}
                              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2 transition hover:border-amber-400/30 hover:bg-white/[0.07]"
                            >
                              <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-amber-200/90">
                                {i + 1}
                              </span>
                              <PlayerAvatar
                                name={t.playerName}
                                profilePicUrl={t.profilePicUrl}
                                sizeClassName="h-10 w-10"
                                textClassName="text-sm"
                              />
                              <span
                                className={`min-w-0 flex-1 truncate font-medium text-stone-100 ${display.className}`}
                              >
                                {t.playerName}
                              </span>
                              <span className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-amber-100">
                                ×{t.wins}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ol>
                      }
                    </div>
                    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-stone-950/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-cyan-200/80">
                        Palm d&apos;Or · career tally
                      </p>
                      {palmTally.length === 0 ?
                        <p className="mt-4 text-sm text-stone-500">No Palm winners on record yet.</p>
                      : <ol className="mt-4 space-y-3">
                        {palmTally.map((t, i) => (
                          <li key={t.playerId}>
                            <Link
                              href={`/player/${t.playerId}`}
                              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2 transition hover:border-cyan-400/30 hover:bg-white/[0.07]"
                            >
                              <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-cyan-200/90">
                                {i + 1}
                              </span>
                              <PlayerAvatar
                                name={t.playerName}
                                profilePicUrl={t.profilePicUrl}
                                sizeClassName="h-10 w-10"
                                textClassName="text-sm"
                              />
                              <span
                                className={`min-w-0 flex-1 truncate font-medium text-stone-100 ${display.className}`}
                              >
                                {t.playerName}
                              </span>
                              <span className="shrink-0 rounded-lg bg-cyan-500/20 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-cyan-100">
                                ×{t.wins}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ol>
                      }
                    </div>
                  </div>
                );
              })()
            : null}
            {rows.length === 0 ?
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
                <p className={`text-lg text-stone-400 ${display.className}`}>No awards yet</p>
                <p className="mt-2 text-sm text-stone-500">
                  Winners appear here once they&apos;re set in Admin → Season awards.
                </p>
              </div>
            : <ul className="space-y-10">
                {rows.map((row) => (
                  <li key={row.seasonLabel}>
                    <article className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-1 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]">
                      <div className="rounded-[1.35rem] border border-white/5 bg-[#0f0e0c]/90 px-5 py-6 sm:px-8 sm:py-8">
                        <div className="mb-6 flex flex-col items-center justify-between gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end">
                          <h2
                            className={`text-center text-2xl text-amber-50/95 sm:text-left sm:text-3xl ${display.className}`}
                          >
                            Season {row.seasonLabel}
                          </h2>
                          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-stone-500">
                            Dual honours
                          </span>
                        </div>
                        <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
                          <WinnerBlock kind="ballon_dor" winner={row.ballon} />
                          <WinnerBlock kind="palm_dor" winner={row.palm} />
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            }
          </>
        }

        <p className="mt-12 text-center text-[0.7rem] text-stone-600">
          Awards are assigned in{" "}
          <Link href="/admin" className="text-amber-600/90 underline-offset-2 hover:text-amber-400 hover:underline">
            Admin
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

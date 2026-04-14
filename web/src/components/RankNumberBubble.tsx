import { rankThirdBubbleClass, rankThirdTier } from "@/lib/rankThirdTier";

/** Label text beside a rank bubble (player / team / national team pages). Uses site sans (Lexend). */
export const RANK_ROW_LABEL_CLASS =
  "font-sans text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-800";

/** Same pill shape as rank bubbles, neutral slate (e.g. MV TBD). */
export function RankTbdBubble() {
  return (
    <span
      className="inline-flex min-w-[1.35rem] items-center justify-center rounded-md px-1.5 py-px font-sans text-[0.65rem] font-bold tabular-nums text-white bg-slate-500 shadow-sm ring-1 ring-slate-600/30"
      title="To be determined"
    >
      TBD
    </span>
  );
}

export function RankNumberBubble({
  rank,
  total,
}: {
  rank: number;
  total: number;
}) {
  if (total <= 0 || rank < 1) {
    return (
      <span className="font-sans text-[0.65rem] font-bold tabular-nums text-slate-700">
        #{rank}
      </span>
    );
  }
  const tier = rankThirdTier(rank, total);
  return (
    <span
      className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-md px-1.5 py-px font-sans text-[0.65rem] font-bold tabular-nums text-white ${rankThirdBubbleClass(tier)}`}
      title={`${rank} of ${total}`}
    >
      #{rank}
    </span>
  );
}

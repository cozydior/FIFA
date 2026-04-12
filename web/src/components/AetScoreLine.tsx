/**
 * Renders an AET badge ONLY when the match went to extra time.
 * Regular wins (no "AET" in the line) render nothing.
 *
 * Shows: regulation score + purple AET/2AET badge (+ SD badge if sudden death).
 * The final score is already shown on the card so the parenthetical is omitted.
 *
 * e.g. "1-1 AET (2-1)"        → `1-1` [AET]
 *      "1-1 2 AET (2-1)"      → `1-1` [2 AET]
 *      "1-1 AET (2-1) · SD"   → `1-1` [AET] [SD]
 */
export function AetScoreLine({
  line,
  className = "",
}: {
  line: string | null | undefined;
  className?: string;
}) {
  if (!line || !line.includes("AET")) return null;

  // Capture: regulation score, AET token (may include count like "2"), optional SD
  // Format: "REG_SCORE [N ]AET (FINAL) [· SD]"
  const aetMatch = line.match(/^([\d\-]+)\s+(\d+\s+AET|AET).*?(·\s*SD)?$/i);
  if (!aetMatch) {
    return (
      <p className={`mt-1.5 flex flex-wrap items-center gap-1 ${className}`}>
        <span className="inline-flex items-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[0.6rem] font-bold text-white">
          AET
        </span>
      </p>
    );
  }

  const regScore = aetMatch[1]?.trim();
  const aetToken = aetMatch[2]?.trim().toUpperCase();
  const sd = aetMatch[3]?.trim();

  return (
    <p className={`mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[0.65rem] font-semibold leading-snug ${className}`}>
      {regScore && <span className="text-slate-500">{regScore}</span>}
      <span className="inline-flex items-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[0.6rem] font-bold text-white">
        {aetToken}
      </span>
      {sd && (
        <span className="inline-flex items-center rounded-full bg-violet-900 px-1.5 py-0.5 text-[0.6rem] font-bold text-white">
          SD
        </span>
      )}
    </p>
  );
}

const STAR_SIZE: Record<"title" | "compact", string> = {
  title:
    "inline-block bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-xl leading-none text-transparent drop-shadow-sm sm:text-2xl",
  compact:
    "inline-block bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-[0.8em] leading-none text-transparent drop-shadow-[0_0.5px_0_rgba(180,83,9,0.35)]",
};

/** Gold stars for major honours (e.g. Champions League, World Cup) — shown to the right of the title. */
export function TrophyTitleStars({
  count,
  label,
  size = "title",
}: {
  count: number;
  label: string;
  /** `compact` for dense UI (e.g. federation table); `title` for page headings. */
  size?: "title" | "compact";
}) {
  if (count <= 0) return null;
  const starClass = STAR_SIZE[size];
  const wrapClass =
    size === "compact" ?
      "inline-flex select-none items-center gap-px self-center sm:gap-0.5"
    : "ml-2 inline-flex select-none items-center gap-0.5 align-middle";

  return (
    <span className={wrapClass} title={`${label} (${count})`} aria-label={`${count} ${label}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={starClass}>
          ★
        </span>
      ))}
    </span>
  );
}

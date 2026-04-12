/** Gold stars for major honours (e.g. Champions League, World Cup) — shown to the right of the title. */
export function TrophyTitleStars({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex select-none items-center gap-0.5 align-middle"
      title={`${label} (${count})`}
      aria-label={`${count} ${label}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="inline-block bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-xl leading-none text-transparent drop-shadow-sm sm:text-2xl"
        >
          ★
        </span>
      ))}
    </span>
  );
}

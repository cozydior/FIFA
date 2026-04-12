import { Trophy } from "lucide-react";

/** Trophy image from URL, or Lucide fallback (server-safe). */
export function TrophyIconDisplay({
  iconUrl,
  className = "h-14 w-14",
}: {
  iconUrl: string | null;
  className?: string;
}) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        className={`max-h-full max-w-full object-contain ${className}`}
        decoding="async"
      />
    );
  }
  return <Trophy className={`text-amber-400 ${className}`} aria-hidden />;
}

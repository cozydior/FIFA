import { competitionBrandLogo } from "@/lib/competitionLogos";

/** Wikimedia / external competition mark for standings & nav (not trophy cabinet). */
export function CompetitionBrandLogo({
  slug,
  className = "h-8 w-8",
  title,
}: {
  slug: string;
  className?: string;
  title?: string;
}) {
  const src = competitionBrandLogo(slug);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={title}
      className={`shrink-0 object-contain ${className}`}
      decoding="async"
    />
  );
}

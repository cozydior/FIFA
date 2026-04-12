/** Human-readable date (avoids raw ISO-style YYYY-MM-DD in UI). */
export function formatShortDate(iso: string | Date | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

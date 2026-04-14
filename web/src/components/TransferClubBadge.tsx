/** Small club crest or initial used in transfer history rows. */
export function TransferClubBadge({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return logoUrl ?
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-0.5" />
    : <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-black text-slate-600"
        title={name}
      >
        {name.trim().slice(0, 1).toUpperCase()}
      </span>;
}

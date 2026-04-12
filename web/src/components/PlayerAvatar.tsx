/**
 * Small circular avatar for lists (profile pic or initial).
 */
export function PlayerAvatar({
  name,
  profilePicUrl,
  sizeClassName = "h-8 w-8",
  textClassName = "text-xs",
}: {
  name: string;
  profilePicUrl?: string | null;
  sizeClassName?: string;
  textClassName?: string;
}) {
  if (profilePicUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profilePicUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-1 ring-slate-200 ${sizeClassName}`}
        decoding="async"
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 ring-1 ring-slate-200 ${textClassName} ${sizeClassName}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

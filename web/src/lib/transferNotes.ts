/** Parsed from Admin transfer API notes. */
export function parsePlayerNameFromTransferNote(note: string | null): string | null {
  if (!note) return null;
  const sale = note.match(/^Sale:\s*(.+?)\s*→/i);
  if (sale?.[1]) return sale[1].trim();
  const buy = note.match(/^Buy:\s*(.+)$/i);
  if (buy?.[1]) return buy[1].trim();
  const fa = note.match(/^Sign free agent:\s*(.+)$/i);
  if (fa?.[1]) return fa[1].trim();
  // Release and free-agency pickup formats
  const released = note.match(/^Released:\s*(.+?)\s*\(/i);
  if (released?.[1]) return released[1].trim();
  const pickup = note.match(/^Pick up free agent:\s*(.+?)\s*\(/i);
  if (pickup?.[1]) return pickup[1].trim();
  return null;
}

export function parseBuyerClubNameFromSaleNote(note: string | null): string | null {
  if (!note?.includes("→")) return null;
  const m = note.match(/→\s*(.+)$/);
  return m?.[1]?.trim() ?? null;
}

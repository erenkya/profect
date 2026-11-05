// Toplu atama matrisinin saf (DB/ağ içermeyen) mantığı: kutucuk durumu, sütunda kalan, kutucuk anahtarı.
// `server-only` içermez; node --test ile doğrudan yüklenebilir. Nihai doğrulama her zaman sunucuda; burası yalnızca arayüz kolaylığıdır.

export type CellState = "open" | "checked" | "assigned" | "burned" | "owned" | "full";

/** Sunucu durumu işaretten önce gelir; işaretli kutu sütun dolsa bile kaldırılabilir kalır. */
export function cellState(i: { server?: "assigned" | "burned" | "owned"; checked: boolean; free: number; pendingInColumn: number }): CellState {
  if (i.server) return i.server;
  if (i.checked) return "checked";
  return columnRemaining(i.free, i.pendingInColumn) > 0 ? "open" : "full";
}

export const columnRemaining = (free: number, pendingInColumn: number): number => Math.max(0, free - pendingInColumn);

/** Matris hücre anahtarı: columnKey "c:<kursId>" ya da "p:<programId>". */
export const cellKey = (userId: number, columnKey: string): string => `${userId}:${columnKey}`;

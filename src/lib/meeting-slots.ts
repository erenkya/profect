// Müsaitlik kurallarından boş slot hesabı (saf). Saat dilimi sabit Europe/Istanbul (UTC+3, DST yok);
// tüm "YYYY-MM-DD" / "HH:mm" değerleri İstanbul yerel zamanıdır.
export type Rule = {
  kind: "available" | "blocked";
  recurrence: "once" | "daily" | "weekly" | "monthly";
  date: string | null; // once için
  startsOn: string; // tekrarlar için başlangıç günü
  until: string | null;
  weekdays: number; // weekly bitmask: Pzt=1 … Paz=64
  startTime: string;
  endTime: string;
};
export type Booked = { startsAt: string; endsAt: string };

export const SLOT_STEP_MIN = 30;
export const MIN_NOTICE_HOURS = 24;
export const MAX_DAYS_AHEAD = 60;

const MIN = 60_000;
const toMs = (day: string, hm: string) => Date.parse(`${day}T${hm.length === 5 ? hm + ":00" : hm}+03:00`);
const dayOfMonth = (day: string) => Number(day.slice(8, 10));

export function ruleCoversDay(rule: Rule, day: string): boolean {
  if (rule.recurrence === "once") return rule.date === day;
  if (day < rule.startsOn) return false;
  if (rule.until && day > rule.until) return false;
  if (rule.recurrence === "daily") return true;
  if (rule.recurrence === "weekly") {
    const idx = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    return (rule.weekdays & (1 << idx)) !== 0;
  }
  return dayOfMonth(rule.startsOn) === dayOfMonth(day); // monthly: o ay günü yoksa atlanır
}

type Args = { rules: Rule[]; booked: Booked[]; durationMin: number; now: Date };

function slotOk(a: Args, start: number): boolean {
  const end = start + a.durationMin * MIN;
  if (start < a.now.getTime() + MIN_NOTICE_HOURS * 60 * MIN) return false;
  if (start > a.now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * MIN) return false;
  const day = new Date(start + 3 * 60 * MIN).toISOString().slice(0, 10);
  const win = (r: Rule) => [toMs(day, r.startTime), toMs(day, r.endTime)] as const;
  const active = a.rules.filter((r) => ruleCoversDay(r, day));
  const inAvailable = active.some((r) => r.kind === "available" && win(r)[0] <= start && end <= win(r)[1]);
  if (!inAvailable) return false;
  if (active.some((r) => r.kind === "blocked" && start < win(r)[1] && win(r)[0] < end)) return false;
  return !a.booked.some((b) => start < toMs(b.endsAt.slice(0, 10), b.endsAt.slice(11, 16)) && toMs(b.startsAt.slice(0, 10), b.startsAt.slice(11, 16)) < end);
}

/** Verilen gün için boş başlangıç saatleri ("HH:mm"), 30 dk'lık saat ızgarasında. */
export function computeSlots(a: Args & { day: string }): string[] {
  const out: string[] = [];
  const dayStart = toMs(a.day, "00:00");
  for (let m = 0; m < 24 * 60; m += SLOT_STEP_MIN) {
    if (slotOk(a, dayStart + m * MIN)) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** "YYYY-MM-DD HH:mm:ss" başlangıcı şu an için geçerli bir boş slot mu? */
export function isValidSlot(a: Args & { startsAt: string }): boolean {
  const day = a.startsAt.slice(0, 10);
  const hm = a.startsAt.slice(11, 16);
  return computeSlots({ ...a, day }).includes(hm) && a.startsAt.slice(17, 19) === "00";
}

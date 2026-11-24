// Görüşme tarih/saat biçimlendirme (saf; istemci ve sunucu ortak).
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
/** "2026-12-03 14:00:00" → "3 Aralık 2026 Perşembe, 14:00 (İstanbul saati)" */
export function formatWhen(s: string): string {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)} ${DAYS[d.getUTCDay()]}, ${s.slice(11, 16)} (İstanbul saati)`;
}


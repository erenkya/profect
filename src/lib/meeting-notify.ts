import "server-only";
import { EXPERTS } from "@/data/experts";
import { sendMeetingEmail } from "@/lib/mail";
import { buildIcs } from "@/lib/meeting-ics";
import { getMeeting, meetingToken, type MeetingRow } from "@/lib/meetings";

export type MeetingEvent =
  | "requested" | "decided_accept" | "decided_decline" | "countered"
  | "confirmed" | "updated" | "cancelled" | "visitor_replied";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
/** "2026-12-03 14:00:00" → "3 Aralık 2026 Perşembe, 14:00 (İstanbul saati)" */
export function formatWhen(s: string): string {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)} ${DAYS[d.getUTCDay()]}, ${s.slice(11, 16)} (İstanbul saati)`;
}

const summary = (m: MeetingRow, when = m.startsAt): [string, string][] => [
  ["Uzman", EXPERTS[m.expert].name],
  ["Zaman", `${formatWhen(when)} · ${m.durationMin} dk`],
  ["Ad soyad", m.fullName], ["Şirket", m.company], ["Rol", m.jobTitle], ["E-posta", m.email],
];

/** Görüşme olayında ilgili tarafa mail yollar. Hata fırlatmaz (after() içinde güvenle çağrılır), loglar. */
export async function notifyMeeting(event: MeetingEvent, meetingId: number, baseUrl: string): Promise<void> {
  try {
    const m = await getMeeting(meetingId);
    if (!m) return;
    const expert = EXPERTS[m.expert];
    const expertUrl = `${baseUrl}/gorusme/yanit/${meetingToken(m.id, "expert")}`;
    const visitorUrl = `${baseUrl}/gorusme/${meetingToken(m.id, "visitor")}`;
    const detail = summary(m);

    switch (event) {
      case "requested":
        await sendMeetingEmail({ to: expert.email, subject: `Yeni görüşme talebi — ${m.fullName}, ${m.company}`, title: "Yeni görüşme talebi",
          intro: `${m.fullName} (${m.company}) sizinle ${m.durationMin} dakikalık bir görüşme talep etti.`, details: detail,
          button: { label: "Talebi Yanıtla", url: expertUrl }, notice: "Kabul edebilir, reddedebilir ya da başka bir saat önerebilirsiniz. Bağlantı 30 gün geçerlidir." });
        await sendMeetingEmail({ to: m.email, subject: `Görüşme talebiniz alındı — ${expert.name}`, title: "Talebiniz alındı",
          intro: `${expert.name} ile görüşme talebiniz iletildi. Yanıt verildiğinde e-posta ile bilgilendirileceksiniz.`, details: detail,
          button: { label: "Talebi Görüntüle / İptal Et", url: visitorUrl }, notice: "Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz." });
        break;
      case "decided_accept":
        await sendMeetingEmail({ to: m.email, subject: `Görüşme talebiniz kabul edildi — ${expert.name}`, title: "Talebiniz kabul edildi",
          intro: `${expert.name} talebinizi kabul etti. Toplantı bağlantısı hazır olunca takvim davetiyle birlikte size ayrıca iletilecek.`, details: detail,
          button: { label: "Talebi Görüntüle", url: visitorUrl }, notice: "Bağlantı geldiğinde bu e-posta adresine davet gönderilecektir." });
        break;
      case "decided_decline":
        await sendMeetingEmail({ to: m.email, subject: `Görüşme talebiniz hakkında — ${expert.name}`, title: "Talebiniz kabul edilemedi",
          intro: `${expert.name} bu talebi şu an kabul edemedi.${m.decisionNote ? ` Not: ${m.decisionNote}` : ""} Dilerseniz farklı bir zaman için yeniden talep oluşturabilirsiniz.`, details: detail,
          button: { label: "Ana Sayfaya Git", url: baseUrl }, notice: "Anlayışınız için teşekkür ederiz." });
        break;
      case "countered":
        await sendMeetingEmail({ to: m.email, subject: `Yeni saat önerisi — ${expert.name}`, title: "Alternatif saat önerisi",
          intro: `${expert.name} talep ettiğiniz saat yerine başka bir saat önerdi.${m.decisionNote ? ` Not: ${m.decisionNote}` : ""} Öneriyi kabul veya reddetmek için aşağıdaki bağlantıyı kullanın.`,
          details: [["Uzman", expert.name], ["Önerilen zaman", `${formatWhen(m.proposedStartsAt ?? m.startsAt)} · ${m.durationMin} dk`], ["Talep ettiğiniz zaman", formatWhen(m.startsAt)]],
          button: { label: "Öneriyi Yanıtla", url: visitorUrl }, notice: "Reddederseniz görüşme talebi kapanır; dilediğiniz zaman yeni talep açabilirsiniz." });
        break;
      case "visitor_replied": {
        const accepted = m.status === "accepted";
        await sendMeetingEmail({ to: expert.email, subject: `${m.fullName} önerinizi ${accepted ? "kabul etti" : "reddetti"}`, title: accepted ? "Öneri kabul edildi" : "Öneri reddedildi",
          intro: accepted ? `${m.fullName} önerdiğiniz saati kabul etti. Lütfen toplantı bağlantısını girin; davet ziyaretçiye otomatik gönderilecek.` : `${m.fullName} önerdiğiniz saati reddetti; görüşme kapandı.`,
          details: detail, ...(accepted && { button: { label: "Toplantı Bağlantısını Gir", url: expertUrl } }), notice: "Bağlantı 30 gün geçerlidir." });
        break;
      }
      case "confirmed":
      case "updated": {
        if (!m.meetingUrl) return;
        const ics = buildIcs({ id: m.id, startsAt: m.startsAt, endsAt: m.endsAt, expertName: expert.name, meetingUrl: m.meetingUrl, attendeeEmail: m.email, sequence: m.icsSequence });
        const upd = event === "updated";
        await sendMeetingEmail({ to: m.email, subject: `${upd ? "Görüşme güncellendi" : "Görüşme davetiniz"} — ${expert.name}`, title: upd ? "Görüşmeniz güncellendi" : "Görüşme davetiniz",
          intro: upd ? `${expert.name} ile görüşmenizin bilgileri güncellendi. Güncel takvim daveti ektedir.` : `${expert.name} ile görüşmeniz onaylandı. Takvim davetini ekte bulabilirsiniz.`,
          details: [["Uzman", expert.name], ["Zaman", `${formatWhen(m.startsAt)} · ${m.durationMin} dk`], ["Toplantı bağlantısı", m.meetingUrl]],
          button: { label: "Toplantıya Katıl", url: m.meetingUrl }, notice: "Takvim davetini (.ics) takvim uygulamanıza ekleyebilirsiniz.", ics: { content: ics } });
        break;
      }
      case "cancelled": {
        await sendMeetingEmail({ to: m.email, subject: `Görüşme iptal edildi — ${expert.name}`, title: "Görüşme iptal edildi",
          intro: `${expert.name} ile ${formatWhen(m.startsAt)} tarihli görüşme iptal edildi.${m.decisionNote ? ` Not: ${m.decisionNote}` : ""}`,
          details: summary(m), notice: "Dilerseniz yeni bir talep oluşturabilirsiniz.",
          ...(m.meetingUrl && { ics: { cancel: true, content: buildIcs({ id: m.id, startsAt: m.startsAt, endsAt: m.endsAt, expertName: expert.name, meetingUrl: m.meetingUrl, attendeeEmail: m.email, sequence: m.icsSequence + 1, cancelled: true }) } }) });
        break;
      }
    }
  } catch (err) {
    console.error(`[notifyMeeting:${event}] #${meetingId}`, err);
  }
}

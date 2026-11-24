import { EXPERTS } from "@/data/experts";
import { formatWhen } from "@/lib/meeting-format";
import type { MeetingRow } from "@/lib/meetings";

export const STATUS_LABEL: Record<MeetingRow["status"], string> = {
  pending: "Yanıt bekleniyor", counter_proposed: "Alternatif saat önerildi", accepted: "Kabul edildi — toplantı bağlantısı bekleniyor",
  confirmed: "Onaylandı", declined: "Reddedildi", cancelled: "İptal edildi",
};

export function MeetingSummary({ m, showVisitor }: { m: MeetingRow; showVisitor?: boolean }) {
  const rows: [string, string][] = [
    ["Uzman", EXPERTS[m.expert].name],
    ["Zaman", `${formatWhen(m.startsAt)} · ${m.durationMin} dk`],
    ...(m.proposedStartsAt ? [["Önerilen zaman", formatWhen(m.proposedStartsAt)] as [string, string]] : []),
    ...(showVisitor ? ([["Ad soyad", m.fullName], ["Şirket", m.company], ["Rol", m.jobTitle], ["E-posta", m.email]] as [string, string][]) : []),
    ["Durum", STATUS_LABEL[m.status]],
  ];
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 20px", margin: "0 0 24px" }}>
      {rows.map(([k, v]) => (<div key={k} style={{ display: "contents" }}><dt style={{ color: "var(--muted-72)" }}>{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>))}
      {m.meetingUrl && <div style={{ display: "contents" }}><dt style={{ color: "var(--muted-72)" }}>Bağlantı</dt><dd style={{ margin: 0 }}><a href={m.meetingUrl} target="_blank" rel="noopener noreferrer">{m.meetingUrl}</a></dd></div>}
    </dl>
  );
}

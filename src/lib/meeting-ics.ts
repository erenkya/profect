// RFC 5545 takvim daveti (.ics). Saat dilimi sabit Europe/Istanbul; satırlar 75 oktette katlanır.
export type IcsInput = {
  id: number; startsAt: string; endsAt: string; expertName: string; meetingUrl: string;
  attendeeEmail: string; sequence: number; cancelled?: boolean;
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const local = (s: string) => `${s.slice(0, 4)}${s.slice(5, 7)}${s.slice(8, 10)}T${s.slice(11, 13)}${s.slice(14, 16)}${s.slice(17, 19)}`;

function fold(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let limit = 75;
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > limit) { parts.push(cur); cur = ch; limit = 74; } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(m: IcsInput): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Profect//Gorusme//TR",
    "CALSCALE:GREGORIAN",
    `METHOD:${m.cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:meeting-${m.id}@profect`,
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${m.sequence}`,
    `DTSTART;TZID=Europe/Istanbul:${local(m.startsAt)}`,
    `DTEND;TZID=Europe/Istanbul:${local(m.endsAt)}`,
    `SUMMARY:${esc(`Profect görüşmesi — ${m.expertName}`)}`,
    `DESCRIPTION:${esc(`Toplantı bağlantısı: ${m.meetingUrl}`)}`,
    `URL:${m.meetingUrl}`,
    `LOCATION:${esc(m.meetingUrl)}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:${m.attendeeEmail}`,
    `STATUS:${m.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

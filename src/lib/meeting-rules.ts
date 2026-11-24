// Görüşme talebi durum makinesi (saf kurallar). Geçiş tablosu tek yerde.
export type MeetingStatus = "pending" | "counter_proposed" | "accepted" | "confirmed" | "declined" | "cancelled";
export type MeetingAction = "accept" | "decline" | "counter" | "visitor_accept" | "visitor_decline" | "set_link" | "cancel";
export type MeetingActor = "expert" | "visitor" | "admin";

type Row = { from: MeetingStatus; to: MeetingStatus; actors: MeetingActor[] };
const TABLE: Record<MeetingAction, Row[]> = {
  accept: [{ from: "pending", to: "accepted", actors: ["expert", "admin"] }],
  decline: [{ from: "pending", to: "declined", actors: ["expert", "admin"] }],
  counter: [{ from: "pending", to: "counter_proposed", actors: ["expert", "admin"] }],
  visitor_accept: [{ from: "counter_proposed", to: "accepted", actors: ["visitor"] }],
  visitor_decline: [{ from: "counter_proposed", to: "declined", actors: ["visitor"] }],
  set_link: [{ from: "accepted", to: "confirmed", actors: ["expert", "admin"] }],
  cancel: [
    { from: "pending", to: "cancelled", actors: ["visitor", "admin"] },
    { from: "counter_proposed", to: "cancelled", actors: ["visitor", "admin"] },
    { from: "accepted", to: "cancelled", actors: ["admin"] },
    { from: "confirmed", to: "cancelled", actors: ["admin"] },
  ],
};

/** Geçerliyse yeni durumu, değilse null döner. */
export function canTransition(from: MeetingStatus, action: MeetingAction, actor: MeetingActor): MeetingStatus | null {
  return TABLE[action].find((r) => r.from === from && r.actors.includes(actor))?.to ?? null;
}

/** Slotu kapatan durumlar (bekleyen talepler slotu kilitlemez). */
export const SLOT_HOLDING: MeetingStatus[] = ["accepted", "confirmed"];

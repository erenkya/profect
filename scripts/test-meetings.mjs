import mysql from "mysql2/promise";
import { applyMeetingAction, createMeetingRequest, createRule, deleteRule, getMeetingByToken, listAvailableDays, listSlotsForDay, updateMeetingDetails } from "../src/lib/meetings.ts";
import { requestSchema, ruleSchema } from "../src/lib/meeting-schemas.ts";
// Uzman görüşme veri katmanı entegrasyon testi (gerçek DB). Kendi kurallarını/taleplerini oluşturur, sonunda siler (e-posta e2e-meet-*@example.invalid).
// Kullanım:  npm run test:meetings
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };
const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306), dateStrings: true });
const stamp = Date.now();
const mail = (n) => `e2e-meet-${stamp}-${n}@example.invalid`;
const ymd = (offsetDays) => new Date(Date.now() + 3 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const D = ymd(10);
const ruleIds = [];
const input = (n, over = {}) => ({ expert: "kaan", durationMin: 30, startsAt: `${D} 10:00:00`, fullName: "E2E Ziyaretçi", email: mail(n), company: "E2E AŞ", jobTitle: "Müdür", userId: null, ...over });

try {
  ruleIds.push(await createRule({ expert: "kaan", kind: "available", recurrence: "once", date: D, startsOn: D, until: null, weekdays: 0, startTime: "10:00", endTime: "12:00", note: `e2e-meet-${stamp}` }));
  check("müsaitlik kuralı → slotlar", (await listSlotsForDay("kaan", 30, D)).join() === "10:00,10:30,11:00,11:30");
  check("müsait günler listesi D'yi içerir", (await listAvailableDays("kaan", 30)).includes(D));
  check("başka uzmanın günü boş", (await listSlotsForDay("tugrul", 30, D)).length === 0);

  const a = await createMeetingRequest(input(1));
  const b = await createMeetingRequest(input(2));
  check("bekleyen iki talep aynı slota kurulabilir", "id" in a && "id" in b);
  check("slot dışı saat reddedilir", (await createMeetingRequest(input(3, { startsAt: `${D} 13:00:00` }))).error === "slot_unavailable");
  const rl = [];
  for (let i = 0; i < 4; i++) rl.push(await createMeetingRequest(input("rl", { startsAt: `${D} 11:30:00` })));
  check("aynı e-postaya günlük 3 talep sınırı", rl.slice(0, 3).every((x) => "id" in x) && rl[3].error === "rate_limited");

  const tok = await getMeetingByToken(a.expertToken);
  check("uzman tokenı → rol expert", tok?.role === "expert" && tok.meeting.id === a.id);
  check("ziyaretçi tokenı → rol visitor", (await getMeetingByToken(a.visitorToken))?.role === "visitor");
  check("geçersiz token → null", (await getMeetingByToken("0".repeat(64))) === null && (await getMeetingByToken("abc")) === null);
  await db.query("UPDATE meeting_requests SET token_expires_at = '2000-01-01 00:00:00' WHERE id = ?", [b.id]);
  check("süresi dolmuş token → null", (await getMeetingByToken(b.expertToken)) === null);

  check("ziyaretçi uzman aksiyonu yapamaz", (await applyMeetingAction({ id: a.id, action: "accept", actor: "visitor" })).reason === "invalid_transition");
  const acc = await applyMeetingAction({ id: a.id, action: "accept", actor: "expert" });
  check("ilk kabul → accepted", acc.ok && acc.meeting.status === "accepted");
  check("aynı slota ikinci kabul → slot_conflict", (await applyMeetingAction({ id: b.id, action: "accept", actor: "admin" })).reason === "slot_conflict");
  check("kabul edilen slot listeden düşer", !(await listSlotsForDay("kaan", 30, D)).includes("10:00"));
  check("linksiz set_link → link_required", (await applyMeetingAction({ id: a.id, action: "set_link", actor: "expert" })).reason === "link_required");
  const conf = await applyMeetingAction({ id: a.id, action: "set_link", actor: "expert", meetingUrl: "https://meet.example.com/x" });
  check("link girilince confirmed", conf.ok && conf.meeting.status === "confirmed" && conf.meeting.meetingUrl === "https://meet.example.com/x");

  check("öneri: geçersiz saat → slot_invalid", (await applyMeetingAction({ id: b.id, action: "counter", actor: "expert", startsAt: `${D} 15:00:00` })).reason === "slot_invalid");
  check("öneri: saat yoksa time_required", (await applyMeetingAction({ id: b.id, action: "counter", actor: "expert" })).reason === "time_required");
  const ctr = await applyMeetingAction({ id: b.id, action: "counter", actor: "expert", startsAt: `${D} 11:00:00` });
  check("öneri → counter_proposed", ctr.ok && ctr.meeting.status === "counter_proposed" && ctr.meeting.proposedStartsAt === `${D} 11:00:00`);
  const va = await applyMeetingAction({ id: b.id, action: "visitor_accept", actor: "visitor" });
  check("ziyaretçi onayı → accepted, saat yeni saat", va.ok && va.meeting.status === "accepted" && va.meeting.startsAt === `${D} 11:00:00` && va.meeting.endsAt === `${D} 11:30:00`);

  check("admin saat güncelleme çakışmada slot_conflict", (await updateMeetingDetails(a.id, { startsAt: `${D} 11:00:00` })).reason === "slot_conflict");
  const b2 = await applyMeetingAction({ id: b.id, action: "set_link", actor: "admin", meetingUrl: "https://meet.example.com/y" });
  const upd = await updateMeetingDetails(a.id, { startsAt: `${D} 11:30:00`, meetingUrl: "https://meet.example.com/z" });
  check("admin güncelleme: yeni saat+link, ics sırası artar", upd.ok && upd.meeting.startsAt === `${D} 11:30:00` && upd.meeting.icsSequence === 1 && b2.ok);
  check("accepted talepte updateMeetingDetails reddedilir", (await updateMeetingDetails(rl[0].id, { startsAt: `${D} 10:30:00` })).reason === "invalid_transition");

  const dec = await applyMeetingAction({ id: rl[0].id, action: "decline", actor: "expert", note: "uygun değil" });
  check("reddet → declined", dec.ok && dec.meeting.status === "declined");
  check("reddedilen talep tekrar kabul edilemez", (await applyMeetingAction({ id: rl[0].id, action: "accept", actor: "expert" })).reason === "invalid_transition");
  const can = await applyMeetingAction({ id: a.id, action: "cancel", actor: "admin" });
  check("admin iptal → cancelled, slot geri açılır", can.ok && (await listSlotsForDay("kaan", 30, D)).includes("11:30"));
  check("ziyaretçi onaylanmış talebi iptal edemez", (await applyMeetingAction({ id: b.id, action: "cancel", actor: "visitor" })).reason === "invalid_transition");
  check("olmayan talep → not_found", (await applyMeetingAction({ id: 999999999, action: "accept", actor: "expert" })).reason === "not_found");

  check("şema: satır sonlu ad reddedilir", !requestSchema.safeParse({ expert: "kaan", durationMin: 30, startsAt: `${D} 10:00:00`, fullName: "Ali\r\nBcc: x@y.z", email: "a@b.co", company: "X Ltd", jobTitle: "CEO" }).success);
  check("şema: 45 dk süre reddedilir", !requestSchema.safeParse({ expert: "kaan", durationMin: 45, startsAt: `${D} 10:00:00`, fullName: "Ali Veli", email: "a@b.co", company: "X Ltd", jobTitle: "CEO" }).success);
  check("şema: haftalık kural gün seçimi ister", !ruleSchema.safeParse({ expert: "kaan", kind: "available", recurrence: "weekly", startsOn: D, weekdays: 0, startTime: "10:00", endTime: "12:00" }).success);
} finally {
  await db.query("DELETE e FROM meeting_request_events e JOIN meeting_requests m ON m.id = e.meeting_id WHERE m.email LIKE ?", [`e2e-meet-${stamp}-%`]);
  await db.query("DELETE FROM meeting_requests WHERE email LIKE ?", [`e2e-meet-${stamp}-%`]);
  for (const id of ruleIds) await deleteRule(id);
  await db.end();
  console.log(`\n${pass} geçti, ${failN} başarısız`);
  process.exit(failN ? 1 : 0);
}

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { createMeetingRequest, createRule, applyMeetingAction, deleteRule } from "../src/lib/meetings.ts";
// Görüşme admin API testi (çalışan dev sunucu + gerçek DB). Kullanım: npm run dev (MAIL_DRY_RUN=true) → npm run test:meetings-admin
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const PW = "Gecici-Sifre-4821!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };
const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306), dateStrings: true });
const stamp = Date.now();
const D = new Date(Date.now() + 3 * 3600_000 + 14 * 86_400_000).toISOString().slice(0, 10);
async function api(path, { method = "GET", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth };
}
const adminMail = `e2e-meet-${stamp}-admin@example.invalid`;
const userMail = `e2e-meet-${stamp}-user@example.invalid`;
const addUser = async (email, role) => (await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())", ["E2E " + role, email, await bcrypt.hash(PW, 10), role]))[0].insertId;
const ruleIds = [];
try {
  await addUser(adminMail, "admin"); await addUser(userMail, "user");
  const admin = (await api("/api/auth/login", { method: "POST", body: { email: adminMail, password: PW, turnstileToken: T } })).auth;
  const user = (await api("/api/auth/login", { method: "POST", body: { email: userMail, password: PW, turnstileToken: T } })).auth;
  check("giriş çerezleri alındı", !!admin && !!user);

  const rule = { expert: "kaan", kind: "available", recurrence: "once", date: D, startTime: "10:00", endTime: "12:00", weekdays: 0, note: `e2e-meet-${stamp}` };
  check("kural: giriş yoksa 401", (await api("/api/admin/meeting-rules", { method: "POST", body: rule })).status === 401);
  check("kural: admin olmayan 403", (await api("/api/admin/meeting-rules", { method: "POST", body: rule, cookie: user })).status === 403);
  check("kural: geçersiz (bitiş<başlangıç) 400", (await api("/api/admin/meeting-rules", { method: "POST", body: { ...rule, startTime: "12:00", endTime: "10:00" }, cookie: admin })).status === 400);
  const created = await api("/api/admin/meeting-rules", { method: "POST", body: rule, cookie: admin });
  check("kural: admin ekler 200", created.status === 200 && created.json.id > 0, JSON.stringify(created.json));
  ruleIds.push(created.json.id);
  const list = await api("/api/admin/meeting-rules?expert=kaan", { cookie: admin });
  check("kural: listede görünür", list.status === 200 && list.json.rules.some((r) => r.id === created.json.id));

  const m = await createMeetingRequest({ expert: "kaan", durationMin: 30, startsAt: `${D} 10:00:00`, fullName: "E2E Ziyaretçi", email: `e2e-meet-${stamp}-v@example.invalid`, company: "E2E AŞ", jobTitle: "Müdür", userId: null });
  check("görüşme: admin olmayan 403", (await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "cancel" }, cookie: user })).status === 403);
  { const r = await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "update", meetingUrl: "https://meet.example.com/q" }, cookie: admin }); check("görüşme: update pending'de 409", r.status === 409, `${r.status} ${JSON.stringify(r.json)}`); }
  check("görüşme: admin kabul eder", (await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "accept" }, cookie: admin })).json?.status === "accepted");
  check("görüşme: admin link girer → confirmed", (await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "set_link", meetingUrl: "https://meet.example.com/q" }, cookie: admin })).json?.status === "confirmed");
  const upd = await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "update", startsAt: `${D} 11:00:00`, meetingUrl: "https://meet.example.com/new" }, cookie: admin });
  check("görüşme: update saat+link", upd.status === 200, JSON.stringify(upd.json));
  const [[row]] = await db.query("SELECT starts_at, meeting_url, ics_sequence FROM meeting_requests WHERE id = ?", [m.id]);
  check("DB: yeni saat, link, ics sırası 1", row.starts_at === `${D} 11:00:00` && row.meeting_url === "https://meet.example.com/new" && row.ics_sequence === 1, JSON.stringify(row));
  check("görüşme: http link 400", (await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "update", meetingUrl: "http://x.example.com" }, cookie: admin })).status === 400);
  check("görüşme: admin iptal eder", (await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "cancel", note: "program değişti" }, cookie: admin })).json?.status === "cancelled");
  check("görüşme: iptal sonrası update 409", (await api(`/api/admin/meetings/${m.id}`, { method: "PATCH", body: { action: "update", meetingUrl: "https://meet.example.com/z" }, cookie: admin })).status === 409);
  check("görüşme: olmayan id 404", (await api("/api/admin/meetings/999999999", { method: "PATCH", body: { action: "cancel" }, cookie: admin })).status === 404);

  check("kural: kullanıcı silemez 403", (await api(`/api/admin/meeting-rules/${created.json.id}`, { method: "DELETE", cookie: user })).status === 403);
  check("kural: admin siler", (await api(`/api/admin/meeting-rules/${created.json.id}`, { method: "DELETE", cookie: admin })).status === 200);
  check("kural: olmayan id 404", (await api(`/api/admin/meeting-rules/${created.json.id}`, { method: "DELETE", cookie: admin })).status === 404);
  check("sayfa: admin olmayan /admin/gorusmeler'e giremez (yönlendirme)", [307, 308].includes((await fetch(`${B}/admin/gorusmeler`, { redirect: "manual", headers: { cookie: user } })).status));
  const pg = await fetch(`${B}/admin/gorusmeler`, { headers: { cookie: admin } });
  check("sayfa: admin görüşmeler sayfasını açar", pg.status === 200 && (await pg.text()).includes("Görüşmeler"));
  check("sayfa: takvim sayfası açılır", (await fetch(`${B}/admin/gorusmeler/takvim`, { headers: { cookie: admin } })).status === 200);
} finally {
  await db.query("DELETE e FROM meeting_request_events e JOIN meeting_requests m ON m.id = e.meeting_id WHERE m.email LIKE ?", [`e2e-meet-${stamp}-%`]);
  await db.query("DELETE FROM meeting_requests WHERE email LIKE ?", [`e2e-meet-${stamp}-%`]);
  await db.query("DELETE FROM expert_availability_rules WHERE note = ?", [`e2e-meet-${stamp}`]);
  await db.query("DELETE FROM users WHERE email LIKE ?", [`e2e-meet-${stamp}-%`]);
  await db.end();
  console.log(`\n${pass} geçti, ${failN} başarısız`);
  process.exit(failN ? 1 : 0);
}

import mysql from "mysql2/promise";
import { createMeetingRequest, createRule, deleteRule, meetingToken } from "../src/lib/meetings.ts";
// Görüşme HTTP API testi (çalışan dev sunucu + gerçek DB). Kullanım: npm run dev (MAIL_DRY_RUN=true) → npm run test:meetings-api
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };
const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306), dateStrings: true });
const stamp = Date.now();
const D = new Date(Date.now() + 3 * 3600_000 + 12 * 86_400_000).toISOString().slice(0, 10);
const FAKE_IP = `10.${stamp % 250}.${(stamp >> 8) % 250}.${(stamp >> 4) % 250}`; // her koşu kendi IP'si: bellek içi IP sınırı koşular arası taşmasın
const call = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", "x-forwarded-for": FAKE_IP }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const form = (n, over = {}) => ({ expert: "tugrul", durationMin: 30, startsAt: `${D} 14:00:00`, fullName: "E2E Ziyaretçi", email: `e2e-meet-${stamp}-api${n}@example.invalid`, company: "E2E AŞ", jobTitle: "Müdür", turnstileToken: T, ...over });
const ruleIds = [];
try {
  ruleIds.push(await createRule({ expert: "tugrul", kind: "available", recurrence: "once", date: D, startsOn: D, until: null, weekdays: 0, startTime: "14:00", endTime: "16:00", note: `e2e-meet-${stamp}` }));

  const days = await call("/api/gorusme/slots?expert=tugrul&duration=30");
  check("slots: gün listesi D'yi içerir", days.status === 200 && days.json.days?.includes(D), JSON.stringify(days.json));
  const slots = await call(`/api/gorusme/slots?expert=tugrul&duration=30&day=${D}`);
  check("slots: saat listesi", slots.status === 200 && slots.json.slots?.join() === "14:00,14:30,15:00,15:30", JSON.stringify(slots.json));
  check("slots: geçersiz uzman 400", (await call("/api/gorusme/slots?expert=x&duration=30")).status === 400);
  check("slots: geçersiz süre 400", (await call("/api/gorusme/slots?expert=tugrul&duration=45")).status === 400);

  check("talep: Turnstile yoksa 400/403", [400, 403].includes((await call("/api/gorusme", { method: "POST", body: form(0, { turnstileToken: undefined }) })).status));
  check("talep: satır sonlu ad 400", (await call("/api/gorusme", { method: "POST", body: form(1, { fullName: "Ali\r\nBcc: x@y.z" }) })).status === 400);
  check("talep: slot dışı saat 409", (await call("/api/gorusme", { method: "POST", body: form(2, { startsAt: `${D} 18:00:00` }) })).status === 409);
  const okRes = await call("/api/gorusme", { method: "POST", body: form(3) });
  check("talep: başarılı 200", okRes.status === 200 && okRes.json.success === true, JSON.stringify(okRes.json));
  const [rows] = await db.query("SELECT status, expert FROM meeting_requests WHERE email = ?", [`e2e-meet-${stamp}-api3@example.invalid`]);
  check("talep DB'de pending", rows.length === 1 && rows[0].status === "pending" && rows[0].expert === "tugrul");

  // --- Yanıt akışı (token'lı PATCH) ---
  const mk = async (n, startsAt) => createMeetingRequest({ expert: "tugrul", durationMin: 30, startsAt: `${D} ${startsAt}`, fullName: "E2E Ziyaretçi", email: `e2e-meet-${stamp}-flow${n}@example.invalid`, company: "E2E AŞ", jobTitle: "Müdür", userId: null });
  const patch = (token, body) => call(`/api/gorusme/${token}`, { method: "PATCH", body });
  const m1 = await mk(1, "14:00:00"), m2 = await mk(2, "14:30:00");
  check("geçersiz token 410", (await patch("0".repeat(64), { action: "accept" })).status === 410);
  check("ziyaretçi tokenı uzman aksiyonu yapamaz 403", (await patch(m1.visitorToken, { action: "accept" })).status === 403);
  check("uzman tokenı ziyaretçi aksiyonu yapamaz 403", (await patch(m1.expertToken, { action: "visitor_accept" })).status === 403);
  check("uzman kabul 200 → accepted", (await patch(m1.expertToken, { action: "accept" })).json?.status === "accepted");
  check("ikinci kabul (zaten accepted) 409", (await patch(m1.expertToken, { action: "accept" })).status === 409);
  check("http:// link 400", (await patch(m1.expertToken, { action: "set_link", meetingUrl: "http://meet.example.com/a" })).status === 400);
  check("linksiz set_link 400", (await patch(m1.expertToken, { action: "set_link" })).status === 400);
  check("https link → confirmed", (await patch(m1.expertToken, { action: "set_link", meetingUrl: "https://meet.example.com/a" })).json?.status === "confirmed");
  check("geçersiz saat önerisi 409", (await patch(m2.expertToken, { action: "counter", startsAt: `${D} 20:00:00` })).status === 409);
  check("geçerli öneri → counter_proposed", (await patch(m2.expertToken, { action: "counter", startsAt: `${D} 15:00:00` })).json?.status === "counter_proposed");
  check("ziyaretçi öneriyi kabul → accepted", (await patch(m2.visitorToken, { action: "visitor_accept" })).json?.status === "accepted");
  check("ziyaretçi onaylanmış talebi iptal edemez 409", (await patch(m2.visitorToken, { action: "cancel" })).status === 409);
  const m3 = await mk(3, "15:30:00");
  check("ziyaretçi bekleyen talebi iptal eder", (await patch(m3.visitorToken, { action: "cancel" })).json?.status === "cancelled");
  check("sayfa: uzman yanıt sayfası açılır", (await fetch(`${B}/gorusme/yanit/${m2.expertToken}`)).status === 200);
  check("sayfa: ziyaretçi sayfası açılır", (await fetch(`${B}/gorusme/${m2.visitorToken}`)).status === 200);
  check("planla sayfası: geçerli uzman 200", (await fetch(`${B}/gorusme/planla/kaan`)).status === 200);
  check("planla sayfası: geçersiz uzman 404", (await fetch(`${B}/gorusme/planla/xyz`)).status === 404);
  const home = await (await fetch(`${B}/`)).text();
  check("ana sayfa: kartlar planlama sayfasına bağlanır", home.includes('href="/gorusme/planla/kaan"') && home.includes('href="/gorusme/planla/tugrul"'));
  check("sayfa: geçersiz token 404", (await fetch(`${B}/gorusme/${"0".repeat(64)}`)).status === 404);
} finally {
  await db.query("DELETE e FROM meeting_request_events e JOIN meeting_requests m ON m.id = e.meeting_id WHERE m.email LIKE ?", [`e2e-meet-${stamp}-%`]);
  await db.query("DELETE FROM meeting_requests WHERE email LIKE ?", [`e2e-meet-${stamp}-%`]);
  for (const id of ruleIds) await deleteRule(id);
  await db.end();
  console.log(`\n${pass} geçti, ${failN} başarısız`);
  process.exit(failN ? 1 : 0);
}

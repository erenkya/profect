import mysql from "mysql2/promise";
import { createRule, deleteRule } from "../src/lib/meetings.ts";
// Görüşme HTTP API testi (çalışan dev sunucu + gerçek DB). Kullanım: npm run dev (MAIL_DRY_RUN=true) → npm run test:meetings-api
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };
const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306), dateStrings: true });
const stamp = Date.now();
const D = new Date(Date.now() + 3 * 3600_000 + 12 * 86_400_000).toISOString().slice(0, 10);
const call = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
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
} finally {
  await db.query("DELETE e FROM meeting_request_events e JOIN meeting_requests m ON m.id = e.meeting_id WHERE m.email LIKE ?", [`e2e-meet-${stamp}-%`]);
  await db.query("DELETE FROM meeting_requests WHERE email LIKE ?", [`e2e-meet-${stamp}-%`]);
  for (const id of ruleIds) await deleteRule(id);
  await db.end();
  console.log(`\n${pass} geçti, ${failN} başarısız`);
  process.exit(failN ? 1 : 0);
}

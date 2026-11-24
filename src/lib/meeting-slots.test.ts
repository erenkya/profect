import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSlots, ruleCoversDay, isValidSlot, type Rule } from "./meeting-slots.ts";

const NOW = new Date("2026-12-01T09:00:00Z"); // 12:00 İstanbul
const rule = (over: Partial<Rule> = {}): Rule => ({
  kind: "available", recurrence: "weekly", date: null, startsOn: "2026-01-01", until: null,
  weekdays: 0b0011111, startTime: "10:00", endTime: "12:00", ...over,
});
const base = { booked: [], durationMin: 15 as const, now: NOW };
const TUE = "2026-12-08"; // Salı

test("haftalık Pzt-Cum 10-12: 30 dk adımlı slotlar", () => {
  assert.deepEqual(computeSlots({ ...base, rules: [rule()], day: TUE }), ["10:00", "10:30", "11:00", "11:30"]);
});
test("30 dk süre: son slot 11:30", () => {
  assert.deepEqual(computeSlots({ ...base, durationMin: 30, rules: [rule()], day: TUE }), ["10:00", "10:30", "11:00", "11:30"]);
});
test("hafta sonu için slot yok", () => {
  assert.deepEqual(computeSlots({ ...base, rules: [rule()], day: "2026-12-12" }), []);
});
test("müsait değil kuralı slotu kapatır", () => {
  const rules = [rule(), rule({ kind: "blocked", recurrence: "once", date: TUE, startTime: "10:30", endTime: "11:00" })];
  assert.deepEqual(computeSlots({ ...base, rules, day: TUE }), ["10:00", "11:00", "11:30"]);
});
test("blok müsait kuralı tamamen örterse slot çıkmaz", () => {
  const rules = [rule(), rule({ kind: "blocked", startTime: "09:00", endTime: "13:00" })];
  assert.deepEqual(computeSlots({ ...base, rules, day: TUE }), []);
});
test("kabul edilmiş toplantı slotu kapatır", () => {
  const booked = [{ startsAt: "2026-12-08 11:00:00", endsAt: "2026-12-08 11:30:00" }];
  assert.deepEqual(computeSlots({ ...base, booked, rules: [rule()], day: TUE }), ["10:00", "10:30", "11:30"]);
});
test("aylık 31. kural şubatta atlanır", () => {
  const r = rule({ recurrence: "monthly", startsOn: "2026-01-31" });
  assert.equal(ruleCoversDay(r, "2027-02-28"), false);
  assert.equal(ruleCoversDay(r, "2027-03-31"), true);
});
test("until geçmişse kural kapsamaz; startsOn öncesi de", () => {
  assert.equal(ruleCoversDay(rule({ until: "2026-12-01" }), TUE), false);
  assert.equal(ruleCoversDay(rule({ startsOn: "2026-12-10" }), TUE), false);
});
test("günlük kural her günü kapsar", () => {
  assert.equal(ruleCoversDay(rule({ recurrence: "daily" }), "2026-12-12"), true);
});
test("+24 saatten yakın slot yok", () => {
  // NOW = 1 Aralık 12:00; 2 Aralık 10:00-12:00 slotları (<24 saat) yok, 12:00'dan sonrası olurdu
  const r = rule({ recurrence: "daily", startTime: "10:00", endTime: "14:00" });
  assert.deepEqual(computeSlots({ ...base, rules: [r], day: "2026-12-02" }), ["12:00", "12:30", "13:00", "13:30"]);
});
test("60 günden uzak gün boş", () => {
  assert.deepEqual(computeSlots({ ...base, rules: [rule({ recurrence: "daily" })], day: "2027-03-15" }), []);
});
test("isValidSlot: listedeki saat geçerli, dışındaki değil", () => {
  const a = { ...base, rules: [rule()] };
  assert.equal(isValidSlot({ ...a, startsAt: "2026-12-08 10:30:00" }), true);
  assert.equal(isValidSlot({ ...a, startsAt: "2026-12-08 10:15:00" }), false);
  assert.equal(isValidSlot({ ...a, startsAt: "2026-12-08 12:00:00" }), false);
});

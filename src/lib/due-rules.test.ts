import { test } from "node:test";
import assert from "node:assert/strict";
import { DUE_SOON_MS, dueBlock, dueInputSchema, dueState, effectiveDue, formatIstanbul, istanbulToUtc, remainingLabel, utcToIstanbulInput } from "./due-rules.ts";

test("istanbulToUtc: Türkiye saati UTC+3'tür", () => {
  assert.equal(istanbulToUtc("2026-11-05T14:30"), "2026-11-05 11:30:00");
  assert.equal(istanbulToUtc("2026-07-01T00:15"), "2026-06-30 21:15:00");
  assert.equal(istanbulToUtc("2026-01-01T02:00"), "2025-12-31 23:00:00");
});

test("istanbulToUtc: geçersiz girdiyi reddeder", () => {
  assert.equal(istanbulToUtc(""), null);
  assert.equal(istanbulToUtc("yarın"), null);
  assert.equal(istanbulToUtc("2026-02-31T10:00"), null);
  assert.equal(istanbulToUtc("2026-11-05T25:00"), null);
  assert.equal(istanbulToUtc("2026-11-05"), null);
});

test("utcToIstanbulInput: istanbulToUtc'nin tersi", () => {
  assert.equal(utcToIstanbulInput("2026-11-05 11:30:00"), "2026-11-05T14:30");
  assert.equal(utcToIstanbulInput(istanbulToUtc("2026-12-31T23:59")!), "2026-12-31T23:59");
});

test("formatIstanbul: Türkiye saatiyle gösterir", () => {
  assert.match(formatIstanbul("2026-11-05 11:30:00"), /14[.:]30/);
  assert.match(formatIstanbul("2026-11-05 11:30:00"), /2026/);
});

test("effectiveDue: ikisinden erken olanı alır, boşları atlar", () => {
  assert.equal(effectiveDue("2026-11-10 10:00:00", "2026-11-08 10:00:00"), "2026-11-08 10:00:00");
  assert.equal(effectiveDue("2026-11-10 10:00:00", null), "2026-11-10 10:00:00");
  assert.equal(effectiveDue(null, "2026-11-08 10:00:00"), "2026-11-08 10:00:00");
  assert.equal(effectiveDue(null, null), null);
});

test("dueState: süre yok / var / yaklaştı / doldu", () => {
  const now = Date.UTC(2026, 10, 5, 12, 0, 0);
  assert.equal(dueState(null, now), "none");
  assert.equal(dueState("2026-11-20 12:00:00", now), "ok");
  assert.equal(dueState("2026-11-07 12:00:00", now), "soon");
  assert.equal(dueState("2026-11-05 12:00:00", now), "overdue");
  assert.equal(dueState("2026-11-05 11:59:59", now), "overdue");
  assert.ok(DUE_SOON_MS > 0);
});

test("dueBlock: geçmiş tarih verilemez", () => {
  const now = Date.UTC(2026, 10, 5, 12, 0, 0);
  assert.equal(dueBlock("2026-11-05 12:00:01", now), null);
  assert.equal(dueBlock("2026-11-05 12:00:00", now), "past");
  assert.equal(dueBlock("2026-11-01 12:00:00", now), "past");
});

test("remainingLabel: gün, saat, dakika ve doldu", () => {
  const now = Date.UTC(2026, 10, 5, 12, 0, 0);
  assert.equal(remainingLabel("2026-11-08 12:00:00", now), "3 gün kaldı");
  assert.equal(remainingLabel("2026-11-05 17:00:00", now), "5 saat kaldı");
  assert.equal(remainingLabel("2026-11-05 12:20:00", now), "20 dakika kaldı");
  assert.equal(remainingLabel("2026-11-05 11:00:00", now), "Süresi doldu");
});

test("dueInputSchema: yerel tarihi UTC'ye çevirir, boşu null yapar", () => {
  assert.equal(dueInputSchema.parse("2026-11-05T14:30"), "2026-11-05 11:30:00");
  assert.equal(dueInputSchema.parse(null), null);
  assert.equal(dueInputSchema.parse(""), null);
  assert.equal(dueInputSchema.safeParse("saçma").success, false);
});

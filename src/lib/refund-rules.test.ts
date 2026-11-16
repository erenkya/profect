import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFUND_WINDOW_DAYS,
  canOverride,
  canTransition,
  evaluateRefund,
  withinRefundWindow,
  type RefundFacts,
} from "./refund-rules.ts";

const NOW = new Date("2026-11-16T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const facts = (over: Partial<RefundFacts> = {}): RefundFacts => ({
  status: "paid",
  amount: 100,
  paidAt: ago(DAY),
  started: false,
  giftClaimed: false,
  seatsWouldUndercut: false,
  hasRequest: false,
  ...over,
});

test("REFUND_WINDOW_DAYS: 14 gün", () => {
  assert.equal(REFUND_WINDOW_DAYS, 14);
});

test("evaluateRefund: temiz sipariş uygundur", () => {
  assert.deepEqual(evaluateRefund(facts(), NOW), { eligible: true, reasons: [] });
});

test("evaluateRefund: 14. günün sonu uygun, bir dakika sonrası window_expired", () => {
  assert.equal(evaluateRefund(facts({ paidAt: ago(14 * DAY) }), NOW).eligible, true);
  const late = evaluateRefund(facts({ paidAt: ago(14 * DAY + 60_000) }), NOW);
  assert.equal(late.eligible, false);
  assert.deepEqual(late.reasons, ["window_expired"]);
});

test("withinRefundWindow: pencere sınırı ve boş tarih", () => {
  assert.equal(withinRefundWindow(ago(14 * DAY), NOW), true);
  assert.equal(withinRefundWindow(ago(14 * DAY + 60_000), NOW), false);
  assert.equal(withinRefundWindow(null, NOW), false);
});

test("evaluateRefund: ödenmemiş ya da iade edilmiş sipariş not_paid", () => {
  for (const status of ["pending", "rejected", "refunded"] as const) {
    assert.deepEqual(evaluateRefund(facts({ status }), NOW).reasons, ["not_paid"]);
  }
});

test("evaluateRefund: 0 TL sipariş free_order", () => {
  assert.deepEqual(evaluateRefund(facts({ amount: 0 }), NOW).reasons, ["free_order"]);
});

test("evaluateRefund: başlanmış eğitim already_started", () => {
  assert.deepEqual(evaluateRefund(facts({ started: true }), NOW).reasons, ["already_started"]);
});

test("evaluateRefund: alınmış hediye gift_claimed", () => {
  assert.deepEqual(evaluateRefund(facts({ giftClaimed: true }), NOW).reasons, ["gift_claimed"]);
});

test("evaluateRefund: kontenjan düşünce atananın altına inecekse seats_assigned", () => {
  assert.deepEqual(evaluateRefund(facts({ seatsWouldUndercut: true }), NOW).reasons, ["seats_assigned"]);
});

test("evaluateRefund: mevcut başvuru request_exists", () => {
  assert.deepEqual(evaluateRefund(facts({ hasRequest: true }), NOW).reasons, ["request_exists"]);
});

test("evaluateRefund: ödenmiş ama tarihi olmayan sipariş window_expired", () => {
  assert.deepEqual(evaluateRefund(facts({ paidAt: null }), NOW).reasons, ["window_expired"]);
});

test("evaluateRefund: birden çok neden birlikte döner", () => {
  const v = evaluateRefund(facts({ started: true, paidAt: ago(20 * DAY) }), NOW);
  assert.equal(v.eligible, false);
  assert.deepEqual([...v.reasons].sort(), ["already_started", "window_expired"]);
});

test("canOverride: yalnızca already_started ve window_expired aşılabilir", () => {
  assert.equal(canOverride(["already_started", "window_expired"]), true);
  assert.equal(canOverride(["window_expired"]), true);
  assert.equal(canOverride(["gift_claimed"]), false);
  assert.equal(canOverride(["already_started", "seats_assigned"]), false);
  assert.equal(canOverride([]), false);
});

test("canTransition: izinli ve yasak geçişler", () => {
  assert.equal(canTransition("requested", "approved"), true);
  assert.equal(canTransition("requested", "rejected"), true);
  assert.equal(canTransition("requested", "refunded"), false);
  assert.equal(canTransition("approved", "refunded"), true);
  assert.equal(canTransition("approved", "failed"), true);
  assert.equal(canTransition("failed", "approved"), true);
  assert.equal(canTransition("failed", "rejected"), true);
  assert.equal(canTransition("refunded", "approved"), false);
  assert.equal(canTransition("rejected", "approved"), false);
});

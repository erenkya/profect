import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "./meeting-rules.ts";

test("uzman kabul: pending → accepted", () => assert.equal(canTransition("pending", "accept", "expert"), "accepted"));
test("link girilince accepted → confirmed (uzman ve admin)", () => {
  assert.equal(canTransition("accepted", "set_link", "expert"), "confirmed");
  assert.equal(canTransition("accepted", "set_link", "admin"), "confirmed");
});
test("uzman öneri: pending → counter_proposed", () => assert.equal(canTransition("pending", "counter", "expert"), "counter_proposed"));
test("ziyaretçi öneriyi kabul: counter_proposed → accepted", () => assert.equal(canTransition("counter_proposed", "visitor_accept", "visitor"), "accepted"));
test("ziyaretçi öneriyi reddeder: counter_proposed → declined", () => assert.equal(canTransition("counter_proposed", "visitor_decline", "visitor"), "declined"));
test("reddedilmiş talep tekrar kabul edilemez", () => assert.equal(canTransition("declined", "accept", "expert"), null));
test("admin confirmed iptal eder", () => assert.equal(canTransition("confirmed", "cancel", "admin"), "cancelled"));
test("ziyaretçi bekleyen talebi iptal eder", () => assert.equal(canTransition("pending", "cancel", "visitor"), "cancelled"));
test("ziyaretçi confirmed talebi iptal edemez", () => assert.equal(canTransition("confirmed", "cancel", "visitor"), null));
test("ziyaretçi uzman aksiyonu yapamaz", () => assert.equal(canTransition("pending", "accept", "visitor"), null));
test("uzman ziyaretçi aksiyonu yapamaz", () => assert.equal(canTransition("counter_proposed", "visitor_accept", "expert"), null));

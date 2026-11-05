import { test } from "node:test";
import assert from "node:assert/strict";
import { RECLAIM_CONFIRM_LABEL, RECLAIM_TITLE, SUPPORT_EMAIL, startedReclaimText } from "./company-copy.ts";

test("destek e-postası ve uyarı başlığı/etiketi sabit metinler", () => {
  assert.equal(SUPPORT_EMAIL, "info@profect.com.tr");
  assert.equal(RECLAIM_TITLE, "Bu eğitim geri alınamaz, yalnızca silinebilir");
  assert.equal(RECLAIM_CONFIRM_LABEL, "Yine de sil");
});

test("startedReclaimText: ad, eğitim, 'yalnızca silinebilir', hak kaybı ve destek e-postası", () => {
  const t = startedReclaimText({ name: "Ayşe", titles: ["Excel"] });
  assert.match(t, /Ayşe bu eğitime başlamış: Excel\./);
  assert.match(t, /geri alınamaz, yalnızca silinebilir/);
  assert.match(t, /hakkı kaybolur/);
  assert.ok(t.includes(SUPPORT_EMAIL));
});

test("startedReclaimText: birden çok eğitim virgülle listelenir", () => {
  assert.match(startedReclaimText({ name: "Ali", titles: ["A", "B"] }), /Ali bu eğitime başlamış: A, B\./);
});

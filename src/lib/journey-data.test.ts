import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENDA, AGENDA_HREF, REFERENCE_LOGOS, STAGES, hasReferences, quoteFor } from "../data/journey.ts";

test("STAGES: Bilgi → Karar → Etki sırası ve İngilizce başlıkları", () => {
  assert.deepEqual(STAGES.map((s) => s.key), ["bilgi", "karar", "etki"]);
  assert.deepEqual(STAGES.map((s) => s.en), ["Knowledge", "Decision", "Impact"]);
  assert.deepEqual(STAGES.map((s) => s.tr), ["Bilgi", "Karar", "Etki"]);
});

test("AGENDA: mockup'taki 6 gündem kartı, benzersiz id, /kurslar'a gider", () => {
  assert.deepEqual(AGENDA.map((a) => a.label), [
    "Maliyetleri düşürmek",
    "Tedarikçi riskini yönetmek",
    "Daha iyi müzakere etmek",
    "AI'ı işimde kullanmak",
    "Stratejik karar almak",
    "Veriden daha iyi yararlanmak",
  ]);
  assert.equal(new Set(AGENDA.map((a) => a.id)).size, 6);
  assert.equal(AGENDA_HREF, "/kurslar");
});

test("quoteFor: onaylı alıntı girilmemişse null (yayına alıntı girmez)", () => {
  assert.equal(quoteFor("01"), null);
  assert.equal(quoteFor("02"), null);
});

test("hasReferences: varsayılan boş liste false, dolu liste true", () => {
  assert.equal(REFERENCE_LOGOS.length, 0);
  assert.equal(hasReferences(), false);
  assert.equal(hasReferences([{ name: "x", src: "/x.svg", width: 10, height: 10 }]), true);
});

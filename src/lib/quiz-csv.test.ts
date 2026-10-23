import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuizCsv, quizCsvTemplate } from "./quiz-csv.ts";

const HEAD = "tip,senaryo,soru,senaryo_sorusu,secenekler,dogru,aciklama";
const errorsOf = (csv: string) => {
  const r = parseQuizCsv(csv);
  assert.equal(r.ok, false);
  return r.ok ? [] : r.errors;
};

test("şablon kendi ayrıştırıcısından geçer: dört tipten birer soru", () => {
  const r = parseQuizCsv(quizCsvTemplate());
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  if (!r.ok) return;
  assert.deepEqual(r.items.map((q) => q.kind), ["single", "multiple", "categorize", "scenario"]);
  const scen = r.items[3];
  assert.equal(scen.kind === "scenario" && scen.questions.length, 2);
  assert.equal(scen.kind === "scenario" && scen.scenario_prompt, "Aşağıdaki soruları bu duruma göre cevaplayın.");
});

test("şablon BOM'lu ve CRLF'li", () => {
  const t = quizCsvTemplate();
  assert.ok(t.startsWith("﻿" + HEAD + "\r\n"));
});

test("tek ve çok cevaplı: şık numarası, harf ve doğru şıklar", () => {
  const r = parseQuizCsv(`${HEAD}\ntek,,S1,,a|b|c,B,\ncoklu,,S2,,x|y|z,"1;C",açık`);
  assert.ok(r.ok);
  if (!r.ok) return;
  const [a, b] = r.items;
  assert.deepEqual(a.kind === "single" && a.options.map((o) => o.is_correct), [false, true, false]);
  assert.deepEqual(b.kind === "multiple" && b.options.map((o) => o.is_correct), [true, false, true]);
  assert.equal(b.kind === "multiple" && b.explanation, "açık");
});

test("noktalı virgül ayırıcı, Türkçe başlıklar ve BOM tanınır", () => {
  const r = parseQuizCsv("﻿Tip;Senaryo;Soru;Senaryo_Sorusu;Seçenekler;Doğru;Açıklama\r\ntek;;Soru;;A|B;1;");
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
});

test("tırnaklı alan: virgül, kaçışlı tırnak ve satır sonu", () => {
  const r = parseQuizCsv(`${HEAD}\ntek,,"Soru, virgüllü ""tırnaklı""\nikinci satır",,"A, a|B",1,`);
  assert.ok(r.ok);
  if (!r.ok) return;
  const q = r.items[0];
  assert.equal(q.kind === "single" && q.question_text, 'Soru, virgüllü "tırnaklı"\nikinci satır');
  assert.equal(q.kind === "single" && q.options[0].option_text, "A, a");
});

test("# satırları ve boş satırlar yok sayılır", () => {
  const r = parseQuizCsv(`${HEAD}\n# not, virgüllü\n\n,,,,,,\ntek,,S,,A|B,1,`);
  assert.ok(r.ok);
  assert.equal(r.ok && r.items.length, 1);
});

test("sürükle-bırak: kategoriler kartlardan, ilk görülme sırasıyla çıkar", () => {
  const r = parseQuizCsv(`${HEAD}\nsuruklebirak,,S,,K1 => Kuş|K2 => Memeli|K3 => Kuş,,`);
  assert.ok(r.ok);
  if (!r.ok) return;
  const q = r.items[0];
  assert.deepEqual(q.kind === "categorize" && q.categories, ["Kuş", "Memeli"]);
  assert.deepEqual(q.kind === "categorize" && q.cards.map((c) => c.category_index), [0, 1, 0]);
});

test("senaryo: alt sorular koda göre bağlanır, sıra korunur", () => {
  const r = parseQuizCsv(`${HEAD}\nsenaryo,S1,Metin,,,,\ntek,,Tek,,A|B,1,\ntek,s1,Alt,,A|B,2,`);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  if (!r.ok) return;
  assert.deepEqual(r.items.map((q) => q.kind), ["scenario", "single"]);
  assert.equal(r.items[0].kind === "scenario" && r.items[0].questions[0].question_text, "Alt");
});

test("hatalar satır numarasıyla bildirilir", () => {
  const errs = errorsOf(`${HEAD}\ntek,,Tamam,,A|B,1,\ncoklu,,Doğrusuz,,A|B,9,\ntek,,Çift doğru,,A|B,"1;2",`);
  assert.ok(errs.some((e) => e.startsWith("Satır 3:") && e.includes("geçerli bir şık numarası")), errs.join("\n"));
  assert.ok(errs.some((e) => e.startsWith("Satır 4:") && e.includes("tam olarak 1 doğru")), errs.join("\n"));
});

test("senaryo alt sorusundaki şema hatası alt sorunun satırını gösterir", () => {
  const errs = errorsOf(`${HEAD}\nsenaryo,S1,Metin,,,,\ntek,S1,Tek şık,,A,1,`);
  assert.ok(errs.some((e) => e.startsWith("Satır 3:")), errs.join("\n"));
});

test("senaryosuz senaryo, bilinmeyen kod, senaryoda sürükle-bırak, alt sorusuz senaryo", () => {
  assert.ok(errorsOf(`${HEAD}\nsenaryo,,Metin,,,,`).some((e) => e.includes("senaryo kodu")));
  assert.ok(errorsOf(`${HEAD}\ntek,S9,Soru,,A|B,1,`).some((e) => e.includes("bulunamadı")));
  assert.ok(errorsOf(`${HEAD}\nsenaryo,S1,M,,,,\nsuruklebirak,S1,Soru,,a => b|c => d,,`).some((e) => e.includes("sürükle-bırak")));
  assert.ok(errorsOf(`${HEAD}\nsenaryo,S1,M,,,,`).some((e) => e.startsWith("Satır 2:") && e.includes("en az bir soru")));
});

test("kart biçimi, bilinmeyen tip, fazla sütun, eksik başlık, boş dosya", () => {
  assert.ok(errorsOf(`${HEAD}\nsuruklebirak,,S,,kartsız|a => b,,`).some((e) => e.includes("kart metni => kategori")));
  assert.ok(errorsOf(`${HEAD}\nacik,,S,,A|B,1,`).some((e) => e.includes("bilinmeyen tip")));
  assert.ok(errorsOf(`${HEAD}\ntek,,S,,A,B,1,,fazla`).some((e) => e.includes("fazla sütun")));
  assert.ok(errorsOf("tip,soru\ntek,S").some((e) => e.includes("eksik sütun")));
  assert.ok(errorsOf("").some((e) => e.includes("boş")));
  assert.ok(errorsOf(HEAD).some((e) => e.includes("soru bulunamadı")));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseByteRange } from "./byte-range.ts";

const SIZE = 10_000_000;
const CHUNK = 4_194_304;
const p = (h: string | null, size = SIZE) => parseByteRange(h, size, CHUNK);

test("başlık yoksa ilk dilim döner", () => {
  assert.deepEqual(p(null), { start: 0, end: CHUNK - 1 });
});

test("küçük dosyada ilk dilim dosya boyutuyla sınırlanır", () => {
  assert.deepEqual(p(null, 1024), { start: 0, end: 1023 });
});

test("açık uçlu aralık dilim sınırına kısaltılır", () => {
  assert.deepEqual(p("bytes=0-"), { start: 0, end: CHUNK - 1 });
  assert.deepEqual(p("bytes=0-99999999"), { start: 0, end: CHUNK - 1 });
});

test("kapalı aralık aynen döner", () => {
  assert.deepEqual(p("bytes=100-199"), { start: 100, end: 199 });
});

test("son bayt sayısı (suffix) dosya sonundan hesaplanır", () => {
  assert.deepEqual(p("bytes=-500"), { start: 9_999_500, end: 9_999_999 });
});

test("dosyanın sonuna yakın açık uçlu aralık dosya sonunda biter", () => {
  assert.deepEqual(p("bytes=9999000-"), { start: 9_999_000, end: 9_999_999 });
});

test("dosyadan sonraki başlangıç karşılanamaz", () => {
  assert.equal(p("bytes=10000000-"), "unsatisfiable");
  assert.equal(p("bytes=99999999-"), "unsatisfiable");
});

test("çoklu, bozuk veya yanlış birimli aralık karşılanamaz", () => {
  for (const h of ["bytes=0-1,5-9", "bytes=abc", "bytes=5-2", "items=0-1", "bytes=", "bytes=-", "bytes=-0", "bytes=1-2-3"]) {
    assert.equal(p(h), "unsatisfiable", h);
  }
});

test("boş dosyada her aralık karşılanamaz", () => {
  assert.equal(p(null, 0), "unsatisfiable");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { drawIds, parseByType, validatePool, type PoolEntry, type PoolKind } from "./quiz-pool.ts";

const identity = <T,>(a: T[]) => a;
const reverse = <T,>(a: T[]) => [...a].reverse();
const SHUFFLES = [identity, reverse];
const KINDS: PoolKind[] = ["single", "multiple", "categorize"];

/** Tip başına soru sayısı ve (her tipin ilk n sorusu) kesin sayısıyla havuz; id'ler 1'den başlar. */
const pool = (spec: Partial<Record<PoolKind, number>>, required: Partial<Record<PoolKind, number>> = {}): PoolEntry[] => {
  const out: PoolEntry[] = [];
  let id = 1;
  for (const kind of KINDS) for (let i = 0; i < (spec[kind] ?? 0); i++) out.push({ id: id++, kind, required: i < (required[kind] ?? 0) });
  return out;
};
const countKind = (entries: PoolEntry[], ids: number[], kind: PoolKind) => ids.filter((id) => entries.find((e) => e.id === id)!.kind === kind).length;
const has = (errors: string[], text: string) => errors.some((e) => e.includes(text));

test("validatePool: 30 soruluk havuzdan 20 soru, kota yok → geçerli", () => {
  assert.deepEqual(validatePool(pool({ single: 10, multiple: 10, categorize: 10 }), { drawCount: 20, byType: {} }), []);
});

test("validatePool: havuzdan fazla soru istenirse hata", () => {
  assert.ok(has(validatePool(pool({ single: 10, multiple: 10, categorize: 10 }), { drawCount: 31, byType: {} }), "havuzda 30 soru var"));
});

test("validatePool: kesin sorular gösterilecek sayıdan fazlaysa hata", () => {
  assert.ok(has(validatePool(pool({ single: 30 }, { single: 21 }), { drawCount: 20, byType: {} }), "yalnızca 20"));
});

test("validatePool: kesin sorular tipin kotasını aşarsa hata", () => {
  assert.ok(has(validatePool(pool({ single: 10 }, { single: 4 }), { drawCount: 10, byType: { single: 3 } }), "tek cevaplı kotası 3"));
});

test("validatePool: kota havuzdaki tip sayısını aşarsa hata", () => {
  assert.ok(has(validatePool(pool({ single: 8, multiple: 10 }), { drawCount: 10, byType: { single: 10 } }), "havuzda 8 tek cevaplı"));
});

test("validatePool: kotaların toplamı gösterilecek sayıyı aşarsa hata", () => {
  assert.ok(has(validatePool(pool({ single: 10, multiple: 10, categorize: 10 }), { drawCount: 20, byType: { single: 10, multiple: 10, categorize: 5 } }), "en az 25"));
});

test("validatePool: kotası olmayan tipteki kesin soru da toplama girer", () => {
  assert.ok(has(validatePool(pool({ single: 10, multiple: 10 }, { multiple: 1 }), { drawCount: 5, byType: { single: 5 } }), "en az 6"));
});

test("validatePool: drawCount null iken gösterilecek sayı havuz boyutudur", () => {
  assert.deepEqual(validatePool(pool({ single: 6, multiple: 4 }), { drawCount: null, byType: { single: 4 } }), []);
});

for (const shuffle of SHUFFLES) {
  const name = shuffle === identity ? "identity" : "reverse";

  test(`drawIds (${name}): kesin sorular dahil, tekrarsız ve drawCount kadar`, () => {
    const entries = pool({ single: 10, multiple: 10, categorize: 10 }, { single: 2, multiple: 1 });
    const ids = drawIds(entries, { drawCount: 20, byType: {} }, shuffle);
    assert.equal(ids.length, 20);
    assert.equal(new Set(ids).size, 20);
    for (const e of entries.filter((x) => x.required)) assert.ok(ids.includes(e.id), `kesin soru ${e.id}`);
  });

  test(`drawIds (${name}): kotaların toplamı drawCount'a eşitse tam o dağılım`, () => {
    const entries = pool({ single: 6, multiple: 6, categorize: 6 });
    const ids = drawIds(entries, { drawCount: 9, byType: { single: 3, multiple: 3, categorize: 3 } }, shuffle);
    assert.equal(ids.length, 9);
    for (const k of KINDS) assert.equal(countKind(entries, ids, k), 3, k);
  });

  test(`drawIds (${name}): kotalar toplamı drawCount'tan azsa kota "en az" olur, kalan tipten bağımsız dolar`, () => {
    const entries = pool({ single: 6, multiple: 6, categorize: 6 });
    const ids = drawIds(entries, { drawCount: 5, byType: { single: 2 } }, shuffle);
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
    assert.ok(countKind(entries, ids, "single") >= 2);
  });

  test(`drawIds (${name}): kesin sorular kendi tipinin kotasına sayılır`, () => {
    const entries = pool({ single: 6, multiple: 6 }, { single: 2 });
    const ids = drawIds(entries, { drawCount: 3, byType: { single: 3 } }, shuffle);
    assert.equal(ids.length, 3);
    assert.equal(countKind(entries, ids, "single"), 3);
    assert.ok(ids.includes(1) && ids.includes(2));
  });

  test(`drawIds (${name}): drawCount null → tüm sorular`, () => {
    const entries = pool({ single: 6, multiple: 6, categorize: 6 });
    assert.deepEqual([...drawIds(entries, { drawCount: null, byType: {} }, shuffle)].sort((a, b) => a - b), entries.map((e) => e.id));
  });

  test(`drawIds (${name}): havuzdan büyük drawCount hata fırlatmaz, eldeki soruları döndürür`, () => {
    const entries = pool({ single: 6, multiple: 6, categorize: 6 });
    assert.equal(drawIds(entries, { drawCount: 50, byType: {} }, shuffle).length, 18);
  });

  test(`drawIds (${name}): tüm sorular kesin ve drawCount kesin sayısına eşitse hepsi çıkar`, () => {
    const entries = pool({ single: 6, multiple: 6, categorize: 6 }, { single: 6, multiple: 6, categorize: 6 });
    assert.deepEqual([...drawIds(entries, { drawCount: 18, byType: {} }, shuffle)].sort((a, b) => a - b), entries.map((e) => e.id));
  });
}

test("parseByType: MariaDB metni, geçersiz anahtar ve değerler atılır", () => {
  assert.deepEqual(parseByType('{"single":5,"x":2,"multiple":0,"categorize":1.5}'), { single: 5 });
});

test("parseByType: MySQL nesnesi", () => {
  assert.deepEqual(parseByType({ multiple: 3, categorize: 2 }), { multiple: 3, categorize: 2 });
});

test("parseByType: null ve bozuk metin → boş nesne", () => {
  assert.deepEqual(parseByType(null), {});
  assert.deepEqual(parseByType("{bozuk"), {});
});

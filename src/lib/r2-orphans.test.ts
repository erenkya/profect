import { test } from "node:test";
import assert from "node:assert/strict";
import { findOrphans, isManagedKey, sweepProblem, MIN_ORPHAN_AGE_MS } from "./r2-orphans.ts";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms);
const VIDEO = "kurslar/web-tasarim/34-giris/a1b2c3d4-html-temelleri.mp4";
const VIDEO2 = "kurslar/web-tasarim/34-giris/b2c3d4e5-css.mp4";
const COVER = "kapaklar/7-a1b2c3d4.png";
const FILE = "dosyalar/7/a1b2c3d4-sunum.pptx";
const obj = (key: string, age = MIN_ORPHAN_AGE_MS * 2) => ({ key, size: 1, modified: ago(age) });

test("isManagedKey: yalnızca uygulamanın ürettiği biçimler", () => {
  for (const k of [VIDEO, COVER, FILE]) assert.ok(isManagedKey(k), k);
  for (const k of ["elle/konan.mp4", "kurslar/x.mp4", "kapaklar/abc.png", "dosyalar/7/../x"]) assert.ok(!isManagedKey(k), k);
});

test("findOrphans: bağlı nesne yetim sayılmaz, bağlı olmayan sayılır", () => {
  const r = findOrphans([obj(VIDEO), obj(VIDEO2), obj(COVER)], new Set([VIDEO]), NOW);
  assert.deepEqual(r.orphans.map((o) => o.key).sort(), [COVER, VIDEO2].sort());
  assert.equal(r.managed, 3);
});

test("findOrphans: 24 saatten genç yetim silinmez (yükleme sürüyor olabilir)", () => {
  const r = findOrphans([obj(VIDEO, MIN_ORPHAN_AGE_MS - 1000), obj(VIDEO2, MIN_ORPHAN_AGE_MS)], new Set(), NOW);
  assert.deepEqual(r.tooNew.map((o) => o.key), [VIDEO]);
  assert.deepEqual(r.orphans.map((o) => o.key), [VIDEO2]);
});

test("findOrphans: yönetilmeyen anahtarlara dokunulmaz", () => {
  const r = findOrphans([obj("elle/konan.mp4"), obj("kurslar/x.mp4")], new Set(), NOW);
  assert.equal(r.managed, 0);
  assert.equal(r.orphans.length, 0);
});

test("sweepProblem: referans yoksa ya da yetim oranı aşırıysa durdurur", () => {
  assert.match(sweepProblem(10, 0, 10) ?? "", /referans/);
  assert.match(sweepProblem(10, 4, 6) ?? "", /force/);
  assert.equal(sweepProblem(10, 6, 4), null);
  assert.equal(sweepProblem(0, 0, 0), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { FREE_PREVIEW_LESSONS, previewLessonIds } from "./preview.ts";

const tree = { modules: [{ lessons: [{ id: 7 }] }, { lessons: [{ id: 3 }, { id: 9 }] }, { lessons: [{ id: 1 }] }] };

test("önizleme dersleri modüller arası müfredat sırasında ilk N tanedir", () => {
  assert.equal(FREE_PREVIEW_LESSONS, 2);
  assert.deepEqual(previewLessonIds(tree), [7, 3]);
});

test("ders sayısı N'den azsa hepsi önizlemedir; ders yoksa boş döner", () => {
  assert.deepEqual(previewLessonIds({ modules: [{ lessons: [{ id: 5 }] }] }), [5]);
  assert.deepEqual(previewLessonIds({ modules: [] }), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { previewLessonIds } from "./preview.ts";

const l = (id: number, is_free_preview = false) => ({ id, is_free_preview });

test("önizleme dersleri yalnızca işaretli olanlardır, müfredat sırasında", () => {
  const tree = { modules: [{ lessons: [l(7), l(8, true)] }, { lessons: [l(3, true), l(9)] }] };
  assert.deepEqual(previewLessonIds(tree), [8, 3]);
});

test("işaretli ders yoksa ya da ders yoksa boş döner", () => {
  assert.deepEqual(previewLessonIds({ modules: [{ lessons: [l(5)] }] }), []);
  assert.deepEqual(previewLessonIds({ modules: [] }), []);
});

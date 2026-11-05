import { test } from "node:test";
import assert from "node:assert/strict";
import { cellKey, cellState, columnRemaining } from "./assign-matrix.ts";

test("cellState: sunucu durumu işaretten önce gelir", () => {
  assert.equal(cellState({ server: "assigned", checked: true, free: 5, pendingInColumn: 1 }), "assigned");
  assert.equal(cellState({ server: "burned", checked: false, free: 5, pendingInColumn: 0 }), "burned");
  assert.equal(cellState({ server: "owned", checked: false, free: 5, pendingInColumn: 0 }), "owned");
});

test("cellState: sütunda kalan varken açık, kalan bitince kapalı; işaretli kutu hep kaldırılabilir", () => {
  assert.equal(cellState({ checked: false, free: 2, pendingInColumn: 1 }), "open");
  assert.equal(cellState({ checked: false, free: 2, pendingInColumn: 2 }), "full");
  assert.equal(cellState({ checked: true, free: 0, pendingInColumn: 1 }), "checked");
  assert.equal(cellState({ checked: false, free: 0, pendingInColumn: 0 }), "full");
});

test("columnRemaining: işaretledikçe düşer, negatife inmez", () => {
  assert.equal(columnRemaining(5, 2), 3);
  assert.equal(columnRemaining(1, 3), 0);
});

test("cellKey: kullanıcı ve sütun anahtarından", () => {
  assert.equal(cellKey(1810, "c:441"), "1810:c:441");
  assert.equal(cellKey(7, "p:12"), "7:p:12");
});

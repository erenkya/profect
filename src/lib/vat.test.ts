import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateVat, orderVat, withVat } from "./vat.ts";

test("withVat: KDV ve KDV dahil tutar kuruş hassasiyetiyle hesaplanır", () => {
  assert.deepEqual(withVat(1000), { net: 1000, vat: 200, gross: 1200 });
  assert.deepEqual(withVat(99.99), { net: 99.99, vat: 20, gross: 119.99 });
  assert.deepEqual(withVat(0), { net: 0, vat: 0, gross: 0 });
});

test("allocateVat: kalem toplamı her zaman withVat(toplam).gross'a eşittir", () => {
  for (const nets of [[100], [33.33, 33.33, 33.34], [0.01, 0.01, 0.01], [499.9, 0, 1250.55], []]) {
    const sum = Math.round(allocateVat(nets).reduce((a, b) => a + b, 0) * 100) / 100;
    assert.equal(sum, withVat(nets.reduce((a, b) => a + b, 0)).gross);
  }
});

test("orderVat: yeni siparişte KDV'yi, KDV öncesi eski siparişte 0 döner", () => {
  assert.equal(orderVat(1200, 1000, 0), 200);
  assert.equal(orderVat(960, 1000, 200), 160); // 800 net → 160 KDV
  assert.equal(orderVat(1000, 1000, 0), 0);
});

"use client";

import { useEffect, useState } from "react";
import type { CartItem } from "@/lib/cart";
import { sameItem } from "@/lib/cart";
import type { QuoteLine } from "@/lib/cart-quote";

type Data = { lines: QuoteLine[]; loggedIn: boolean; provider: "manual" | "mock" | "tami" };

/**
 * Sepet kalemlerinin güncel fiyat/başlığını sunucudan alır. Gösterilen satırlar her zaman yerel sepetle
 * süzülür (kalem silinince anında kaybolur); toplam yalnızca gösterim içindir, tahsil edilen tutarı sunucu hesaplar.
 */
export function useQuote(items: CartItem[], ready: boolean) {
  const key = JSON.stringify(items);
  const [res, setRes] = useState<{ key: string; data: Data | null }>({ key: "", data: null });

  useEffect(() => {
    if (!ready || items.length === 0) return;
    const ctrl = new AbortController();
    fetch("/api/cart/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }), signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setRes({ key, data: json?.success ? (json as Data) : null }))
      .catch(() => ctrl.signal.aborted || setRes({ key, data: null }));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const loading = ready && items.length > 0 && res.key !== key && res.data === null;
  const failed = ready && items.length > 0 && res.key === key && res.data === null;
  const lines = (res.data?.lines ?? []).filter((l) => items.some((i) => sameItem(i, l.item)));
  const payable = lines.filter((l) => l.status === "ok");
  const total = Math.round(payable.reduce((s, l) => s + l.price, 0) * 100) / 100;
  return { lines, payable, total, loading, failed, loggedIn: res.data?.loggedIn ?? false, provider: res.data?.provider ?? "manual" };
}

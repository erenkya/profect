"use client";

import { useSyncExternalStore } from "react";

// Sepet yalnızca "ne var" bilgisini tarayıcıda tutar (kurs slug'ı / Plus). Fiyat ve başlık her zaman
// sunucudan (/api/cart/quote) gelir; böylece eski fiyat sepette asılı kalmaz ve istemciden tutar alınmaz.
export type CartItem = { type: "course"; slug: string } | { type: "plus" };

const KEY = "profect_cart_v1";
export const CART_MAX_ITEMS = 20;
const EMPTY: CartItem[] = [];

let cache: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };
const listeners = new Set<() => void>();

function parse(raw: string | null): CartItem[] {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return EMPTY;
    const out: CartItem[] = [];
    for (const it of data) {
      if (it && typeof it === "object" && (it as { type?: unknown }).type === "plus") {
        if (!out.some((o) => o.type === "plus")) out.push({ type: "plus" });
      } else if (it && typeof it === "object" && (it as { type?: unknown }).type === "course" && typeof (it as { slug?: unknown }).slug === "string") {
        const slug = (it as { slug: string }).slug;
        if (slug && !out.some((o) => o.type === "course" && o.slug === slug)) out.push({ type: "course", slug });
      }
    }
    return out.slice(0, CART_MAX_ITEMS);
  } catch {
    return EMPTY;
  }
}

function read(): CartItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    /* depolama kapalı → boş sepet */
  }
  if (raw !== cache.raw) cache = { raw, items: parse(raw) };
  return cache.items;
}

function write(items: CartItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* depolama dolu/kapalı → bu oturumda bellekte kalır */
    cache = { raw: JSON.stringify(items), items };
  }
  listeners.forEach((l) => l());
}

export const sameItem = (a: CartItem, b: CartItem) => (a.type === "plus" ? b.type === "plus" : b.type === "course" && a.slug === b.slug);

export function addToCart(item: CartItem) {
  const cur = read();
  if (cur.some((c) => sameItem(c, item)) || cur.length >= CART_MAX_ITEMS) return;
  write([...cur, item]);
}

export function removeFromCart(item: CartItem) {
  write(read().filter((c) => !sameItem(c, item)));
}

export function clearCart() {
  write([]);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Sepet içeriği. Sunucuda (ve ilk hidrasyonda) boş döner; `ready` istemcide okunduktan sonra true olur. */
export function useCart() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return { items, ready };
}

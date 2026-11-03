"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "profect:hands-free";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // başka sekmede değişirse
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Eller serbest modu: cihaza özgü tercih (localStorage). Sunucuda/ilk çizimde kapalı kabul edilir. */
export function useHandsFree(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* depolama kapalı: tercih kalıcı olmaz */
    }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}

"use client";

import { useEffect } from "react";
import { clearCart } from "@/lib/cart";

/** Sipariş kaydedildiğinde (ödendi / onay bekliyor) sepeti boşaltır. */
export function ClearCartOnMount() {
  useEffect(() => clearCart(), []);
  return null;
}

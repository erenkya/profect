"use client";

import Link from "next/link";
import "@/components/checkout/checkout.css";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

export function CartLink() {
  const { items, ready } = useCart();
  const n = ready ? items.length : 0;
  return (
    <Link href="/sepet" className="btn btn-secondary cart-link" aria-label={n ? `Sepet, ${n} ürün` : "Sepet"} style={{ padding: "9px 12px", position: "relative" }}>
      <ShoppingCart size={18} aria-hidden />
      {n > 0 && <span className="cart-badge" aria-hidden>{n}</span>}
    </Link>
  );
}

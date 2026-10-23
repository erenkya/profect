import type { Metadata } from "next";
import { CartView } from "@/components/checkout/CartView";

export const metadata: Metadata = { title: "Sepetim", robots: { index: false, follow: false } };

export default function CartPage() {
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(40px,6vw,80px)" }}>
      <div className="eyebrow">Sipariş</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>Sepetim</h1>
      <CartView />
    </main>
  );
}

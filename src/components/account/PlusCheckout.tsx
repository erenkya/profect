"use client";

import { useRouter } from "next/navigation";
import { Corners } from "@/components/Corners";
import { addToCart } from "@/lib/cart";

/** Profect Plus’ı sepete ekleyip ödeme sayfasına götürür (sipariş /odeme’de oluşur). */
export function PlusCheckout({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-primary blueprint"
      style={{ padding: "12px 24px", alignSelf: "flex-start" }}
      onClick={() => {
        addToCart({ type: "plus" });
        router.push("/odeme");
      }}
    >
      <Corners />
      {label}
    </button>
  );
}

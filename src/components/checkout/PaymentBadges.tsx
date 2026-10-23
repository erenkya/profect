import Image from "next/image";
import { Shield } from "lucide-react";

/** Kabul edilen kartlar + ödeme kuruluşu logoları. Güvence cümlesi yalnızca gerçek kartlı ödeme açıkken gösterilir. */
export function PaymentBadges({ secured }: { secured: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 4 }}>
      <Image src="/images/payment/card-logos-band.svg" alt="Visa, Mastercard, American Express, Troy kabul edilir" width={304} height={32} style={{ height: 24, width: "auto" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Image src="/images/payment/garanti-bbva-logo.png" alt="Garanti BBVA" width={1916} height={352} style={{ height: 20, width: "auto" }} />
        <span aria-hidden style={{ width: 1, height: 20, background: "var(--color-divider)" }} />
        <Image src="/images/payment/tami-logo.png" alt="Tami" width={949} height={344} style={{ height: 24, width: "auto" }} />
      </div>
      {secured && (
        <p style={{ margin: 0, display: "flex", gap: 6, alignItems: "flex-start", justifyContent: "center", textAlign: "center", fontSize: 12, color: "var(--muted-55)" }}>
          <Shield size={14} aria-hidden style={{ flex: "none", marginTop: 1 }} />
          <span>Garanti BBVA kuruluşu Tami güvencesiyle 256-bit SSL ve 3D Secure ile korunmaktadır. Kart bilgileriniz saklanmaz.</span>
        </p>
      )}
    </div>
  );
}

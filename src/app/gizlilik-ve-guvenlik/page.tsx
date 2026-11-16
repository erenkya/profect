import type { Metadata } from "next";
import { CheckoutPrivacyContent } from "@/components/legal/CheckoutLegalContent";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Gizlilik ve Güvenlik Sözleşmesi",
  description: "Sipariş ve ödeme sürecinde paylaşılan bilgilerin korunması ve kart güvenliği hakkında bilgilendirme.",
};

export default function PrivacySecurityPage() {
  return (
    <LegalPageShell title="Gizlilik ve Güvenlik Sözleşmesi" lead="Sipariş ve ödeme bilgilerinizin işlenmesi ve korunması.">
      <CheckoutPrivacyContent />
    </LegalPageShell>
  );
}

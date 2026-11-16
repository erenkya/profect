import type { Metadata } from "next";
import { DeliveryReturnContent } from "@/components/legal/CheckoutLegalContent";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Teslimat, İade ve İptal Koşulları",
  description: "Profect’te satın alınan eğitimlerin teslimatı, cayma, iade ve iptal koşulları.",
};

export default function DeliveryReturnPage() {
  return (
    <LegalPageShell title="Teslimat, İade ve İptal Koşulları" lead="Dijital eğitim içeriklerinin erişimi ve iade süreci hakkında bilgilendirme.">
      <DeliveryReturnContent />
    </LegalPageShell>
  );
}

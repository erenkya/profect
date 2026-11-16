import type { Metadata } from "next";
import { DistanceSalesContent } from "@/components/legal/CheckoutLegalContent";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi",
  description: "Profect üzerinden satın alınan çevrimiçi eğitimlere ilişkin mesafeli satış sözleşmesi.",
};

export default function DistanceSalesPage() {
  return (
    <LegalPageShell title="Mesafeli Satış Sözleşmesi" lead="6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamında.">
      <DistanceSalesContent />
    </LegalPageShell>
  );
}

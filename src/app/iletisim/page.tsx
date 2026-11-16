import type { Metadata } from "next";
import { COMPANY } from "@/components/legal/company";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import "@/components/checkout/checkout.css";

export const metadata: Metadata = {
  title: "İletişim",
  description: "Profect iletişim ve şirket bilgileri.",
};

export default function ContactPage() {
  return (
    <LegalPageShell title="İletişim" lead="Sorularınız ve destek talepleriniz için bize ulaşabilirsiniz.">
      <div className="legal-text">
        <h3>Şirket bilgileri</h3>
        <p>
          <strong>{COMPANY.name}</strong><br />
          {COMPANY.address}<br />
          MERSİS: {COMPANY.mersis}
        </p>
        <h3>E-posta</h3>
        <p><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>
      </div>
    </LegalPageShell>
  );
}

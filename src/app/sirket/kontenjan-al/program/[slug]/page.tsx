import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { requireCompanyAdminPage } from "@/lib/company-guard";
import pool from "@/lib/db";
import { getAccountProfile } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";
import { getProgramOffer } from "@/lib/programs";

export const metadata: Metadata = { title: "Program kontenjanı satın al" };

export default async function BuyProgramSeatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, companyId } = await requireCompanyAdminPage();
  const offer = await getProgramOffer(slug, null);
  if (!offer || !offer.sellable || offer.calc.effectivePrice <= 0) notFound();
  const [rows] = await pool.query<RowDataPacket[]>("SELECT name, tax_office, tax_number FROM companies WHERE id = ?", [companyId]);
  if (rows.length === 0) notFound();
  const profile = await getAccountProfile(user.id);
  return (
    <>
      <div className="eyebrow">{rows[0].name}</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>Program kontenjanı satın al</h1>
      <CheckoutForm
        defaults={{ full_name: user.full_name, email: user.email, phone: profile?.phone ?? "" }}
        seats={{
          kind: "program", companyId, slug: offer.program.slug, title: offer.program.title, unitPrice: offer.calc.effectivePrice, provider: paymentProvider().id,
          company: { name: rows[0].name, tax_office: rows[0].tax_office ?? "", tax_number: rows[0].tax_number ?? "" },
        }}
      />
    </>
  );
}

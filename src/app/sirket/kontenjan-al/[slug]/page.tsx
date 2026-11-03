import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { requireCompanyAdminPage } from "@/lib/company-guard";
import pool from "@/lib/db";
import { getAccountProfile, getCourseBySlug } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";

export const metadata: Metadata = { title: "Kontenjan satın al" };

export default async function BuySeatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, companyId } = await requireCompanyAdminPage();
  const course = await getCourseBySlug(slug);
  if (!course || course.price <= 0) notFound();
  const [rows] = await pool.query<RowDataPacket[]>("SELECT name, tax_office, tax_number FROM companies WHERE id = ?", [companyId]);
  if (rows.length === 0) notFound();
  const profile = await getAccountProfile(user.id);
  return (
    <>
      <div className="eyebrow">{rows[0].name}</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>Kontenjan satın al</h1>
      <CheckoutForm
        defaults={{ full_name: user.full_name, email: user.email, phone: profile?.phone ?? "" }}
        seats={{
          companyId, slug: course.slug, title: course.title, unitPrice: course.price, provider: paymentProvider().id,
          company: { name: rows[0].name, tax_office: rows[0].tax_office ?? "", tax_number: rows[0].tax_number ?? "" },
        }}
      />
    </>
  );
}

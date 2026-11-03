import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { CompanyAdminControls } from "@/components/admin/CompanyAdminControls";
import { CompanyPanel } from "@/components/company/CompanyPanel";
import pool from "@/lib/db";
import { getCompanyPanelData } from "@/lib/company-panel";

export const metadata = { title: "Şirket" };

export default async function AdminCompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = await getCompanyPanelData(id);
  if (!data) notFound();
  const [[co], [doms]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT is_active FROM companies WHERE id = ?", [id]),
    pool.query<RowDataPacket[]>("SELECT domain FROM company_domains WHERE company_id = ? ORDER BY domain", [id]),
  ]);
  return (
    <>
      <p style={{ margin: "0 0 12px" }}><Link href="/admin/sirketler">← Tüm şirketler</Link></p>
      <CompanyAdminControls companyId={id} isActive={!!co[0]?.is_active} domains={doms.map((d) => d.domain)} />
      <CompanyPanel data={data} platform />
    </>
  );
}

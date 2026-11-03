import { notFound } from "next/navigation";
import { CompanyPanel } from "@/components/company/CompanyPanel";
import { requireCompanyAdminPage } from "@/lib/company-guard";
import { getCompanyPanelData } from "@/lib/company-panel";

export default async function CompanyPage() {
  const { companyId } = await requireCompanyAdminPage();
  const data = await getCompanyPanelData(companyId);
  if (!data) notFound();
  return <CompanyPanel data={data} />;
}

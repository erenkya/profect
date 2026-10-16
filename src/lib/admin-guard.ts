import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** Sayfa düzeyi yönetici koruması: JWT değil, DB'deki güncel rol esas alınır. */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/admin");
  if (user.role !== "admin") redirect("/hesabim");
  return user;
}

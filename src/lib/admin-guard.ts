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

/** Eğitmen paneli koruması: yönetici ya da eğitmen rolü (DB'deki güncel rol esas alınır). */
export async function requireStaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/egitmen/sorular");
  if (user.role !== "admin" && user.role !== "instructor") redirect("/hesabim");
  return user;
}

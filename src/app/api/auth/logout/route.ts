import { clearAuthCookies } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  return clearAuthCookies(ok({ message: "Çıkış yapıldı." }));
}

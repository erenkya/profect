import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { isMaintenanceMode, isMaintenanceExempt, MAINTENANCE_HTML } from "@/lib/maintenance";

// Yalnızca ilk savunma hattı: imzalı JWT var mı / admin rolü var mı. Güncel hesap durumu ve rol
// sayfalarda ve API'lerde DB'den yeniden doğrulanır (JWT durumsuzdur).
async function readSession(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return payload as { userId?: number; role?: string };
  } catch {
    return null;
  }
}

const PROTECTED = ["/admin", "/hesabim", "/odeme", "/sirket"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await readSession(req);

  if (isMaintenanceMode() && !isMaintenanceExempt(pathname) && session?.role !== "admin") {
    const headers = { "Retry-After": "3600", "Cache-Control": "no-store" };
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Site bakımda. Lütfen daha sonra tekrar dene." }, { status: 503, headers });
    }
    return new NextResponse(MAINTENANCE_HTML, {
      status: 503,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  if (!session) {
    const url = new URL("/giris", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/hesabim", req.url));
  }
  return NextResponse.next();
}

// Bakım modu tüm sayfaları kapsayacağından matcher geniştir (statik dosyalar hariç); oturum zorunluluğu
// PROTECTED listesiyle sınırlıdır. /ogrenim listede yok: ilk 2 ders girişsiz de açılır; kurs içi sayfalar
// kendi erişim kontrolünü yapar.
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};

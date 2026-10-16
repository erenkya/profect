import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";

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

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await readSession(req);

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

export const config = {
  matcher: ["/admin/:path*", "/hesabim/:path*", "/ogrenim/:path*"],
};

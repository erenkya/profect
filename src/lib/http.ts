import "server-only";
import { NextResponse } from "next/server";
import type { ZodTypeAny, z } from "zod";

export const ok = (data: Record<string, unknown> = {}, status = 200) =>
  NextResponse.json({ success: true, ...data }, { status });

export const fail = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status });

/** Gerçek hatayı sunucuda loglar, istemciye yalnızca genel mesaj döner (DB iç detayı sızmasın). */
export function serverError(context: string, error: unknown) {
  console.error(context, error);
  return fail("Sunucu hatası oluştu.", 500);
}

/** İstek gövdesini zod şemasıyla doğrular. */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ data: z.infer<S>; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: fail("Geçersiz istek gövdesi.") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: fail(`Doğrulama hatası: ${first.path.join(".") || "gövde"} — ${first.message}`) };
  }
  return { data: parsed.data };
}

export function parseId(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Kullanıcı e-postası/URL ayrıştırması için istek kökünü bulur. */
export function getBaseUrl(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) return `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : proto}://${host}`;
  return process.env.APP_URL || "http://localhost:3000";
}

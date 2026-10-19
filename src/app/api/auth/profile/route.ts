import { z } from "zod";
import pool from "@/lib/db";
import { USER_DATA_COOKIE_NAME, requireUser } from "@/lib/auth";
import { ok, parseBody, serverError } from "@/lib/http";

const schema = z.object({
  full_name: z.string().trim().min(2, "Ad soyad gerekli.").max(150),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export async function PATCH(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const { full_name, phone } = body.data;
  try {
    await pool.execute("UPDATE users SET full_name = ?, phone = ? WHERE id = ?", [full_name, phone || null, guard.payload.userId]);
    const res = ok({ message: "Profil bilgilerin güncellendi.", full_name, phone: phone || "" });
    // Arayüz çerezindeki ad da güncel kalsın (JWT'de ad yok; yalnızca bu hassas olmayan çerez).
    res.cookies.set(
      USER_DATA_COOKIE_NAME,
      encodeURIComponent(JSON.stringify({ id: guard.payload.userId, full_name, email: guard.payload.email, role: guard.payload.role })),
      { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 },
    );
    return res;
  } catch (err) {
    return serverError("[PATCH /api/auth/profile]", err);
  }
}

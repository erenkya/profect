import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT password_hash FROM users WHERE id = ?", [guard.payload.userId]);
    if (!rows[0] || !(await bcrypt.compare(body.data.currentPassword, rows[0].password_hash))) {
      return fail("Mevcut şifre hatalı.", 400);
    }
    const hash = await bcrypt.hash(body.data.newPassword, 10);
    await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, guard.payload.userId]);
    return ok({ message: "Şifreniz güncellendi." });
  } catch (err) {
    return serverError("[POST /api/auth/change-password]", err);
  }
}

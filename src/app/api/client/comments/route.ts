import { after } from "next/server";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { COMMENT_MAX, canAnswerLesson, notifyQuestion, tooManyComments } from "@/lib/comments";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import { canAccessCourse } from "@/lib/lms";

const schema = z.object({
  lesson_id: z.number().int().positive(),
  parent_id: z.number().int().positive().nullable().default(null),
  body: z.string().trim().min(1, "Mesaj boş olamaz.").max(COMMENT_MAX, `Mesaj en çok ${COMMENT_MAX} karakter olabilir.`),
});

/** Ders altına soru (parent_id yok) ya da cevap yazar. Her yorum eğitmene / yöneticilere e-postayla bildirilir. */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const d = body.data;
  const user = { id: guard.payload.userId, role: guard.payload.role };

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?",
      [d.lesson_id],
    );
    if (rows.length === 0) return fail("Ders bulunamadı.", 404);

    // Personel (yönetici / dersin eğitmeni) kayıtsız da cevap yazar; diğerleri yalnızca kursa erişimi varsa.
    const staff = await canAnswerLesson(user, d.lesson_id);
    if (!staff && !(await canAccessCourse(user.id, rows[0].course_id))) return fail("Soru sormak için kursa kayıtlı olmalısınız.", 403);

    if (d.parent_id !== null) {
      const [p] = await pool.query<RowDataPacket[]>("SELECT 1 FROM lesson_comments WHERE id = ? AND lesson_id = ? AND parent_id IS NULL", [d.parent_id, d.lesson_id]);
      if (p.length === 0) return fail("Cevaplanacak soru bulunamadı.", 404);
    }
    if (await tooManyComments(user.id)) return fail("Çok hızlı yazıyorsunuz, lütfen biraz bekleyin.", 429);

    const [res] = await pool.execute<ResultSetHeader>(
      "INSERT INTO lesson_comments (lesson_id, user_id, parent_id, body) VALUES (?, ?, ?, ?)",
      [d.lesson_id, user.id, d.parent_id, d.body],
    );

    const [u] = await pool.query<RowDataPacket[]>("SELECT full_name, email FROM users WHERE id = ?", [user.id]);
    // Yanıt dönünce gönderilir (SMTP yavaşsa istek beklemez); hata notifyQuestion içinde loglanır.
    const mail = {
      authorName: u[0]?.full_name ?? "Bir kullanıcı",
      authorEmail: u[0]?.email ?? "",
      byStaff: staff,
      body: d.body,
      baseUrl: getBaseUrl(request),
      commentId: d.parent_id ?? res.insertId,
    };
    after(() => notifyQuestion(d.lesson_id, mail));
    return ok({ commentId: res.insertId }, 201);
  } catch (err) {
    return serverError("[POST /api/client/comments]", err);
  }
}

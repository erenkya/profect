import "server-only";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { coverUrl } from "@/lib/cover-key";
import { PLUS_DAYS, PLUS_PRICE, getCourseBySlug, hasPlus } from "@/lib/lms";
import type { CartItem } from "@/lib/cart";

export type QuoteLine = {
  key: string;
  item: CartItem;
  title: string;
  subtitle: string;
  price: number;
  oldPrice: number | null;
  cover: string | null;
  courseId: number | null;
  /** ok: satın alınabilir · owned: erişim zaten var · unavailable: kurs yayından kalkmış / bulunamadı */
  status: "ok" | "owned" | "unavailable";
};

export type Quote = { lines: QuoteLine[]; total: number; payable: QuoteLine[] };

/**
 * Sepeti fiyatlandırır. Fiyat/başlık DAİMA DB'den okunur; istemcinin gönderdiği tek şey "hangi kalem"dir.
 * Aynı sepet hem gösterim (/api/cart/quote) hem sipariş oluşturma (/api/checkout) için kullanılır.
 */
export async function quoteCart(items: CartItem[], userId?: number | null): Promise<Quote> {
  const plus = userId ? await hasPlus(userId) : false;
  const lines: QuoteLine[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.type === "plus" ? "plus" : `course:${item.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (item.type === "plus") {
      lines.push({
        key,
        item,
        title: "Profect Plus · aylık",
        subtitle: `Tüm kurslar · sınırsız sertifika · ${PLUS_DAYS} gün`,
        price: PLUS_PRICE,
        oldPrice: null,
        cover: null,
        courseId: null,
        status: "ok",
      });
      continue;
    }

    const course = await getCourseBySlug(item.slug);
    if (!course) {
      lines.push({ key, item, title: item.slug, subtitle: "Bu kurs artık satışta değil.", price: 0, oldPrice: null, cover: null, courseId: null, status: "unavailable" });
      continue;
    }
    let owned = plus;
    if (userId && !owned) {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1", [userId, course.id]);
      owned = rows.length > 0;
    }
    lines.push({
      key,
      item,
      title: course.title,
      subtitle: `${course.instructor} · ${course.hours} saat · Ömür boyu erişim`,
      price: course.price,
      oldPrice: course.old_price,
      cover: coverUrl(course.thumbnail_url),
      courseId: course.id,
      status: owned ? "owned" : "ok",
    });
  }

  const payable = lines.filter((l) => l.status === "ok");
  const total = Math.round(payable.reduce((s, l) => s + l.price, 0) * 100) / 100;
  return { lines, total, payable };
}

import "server-only";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { coverUrl } from "@/lib/cover-key";
import { formatDuration } from "@/lib/format";
import { PLUS_DAYS, PLUS_PRICE, getCourseBySlug, hasPlus } from "@/lib/lms";
import type { CartItem } from "@/lib/cart";
import { getProgramOffer, isProgramMember, listOwnedCourseIds, type ProgramOffer } from "@/lib/programs";
import { priceProgramsInOrder, type ProgramQuoteCalc } from "@/lib/program-pricing";

export type QuoteLine = {
  key: string;
  item: CartItem;
  title: string;
  subtitle: string;
  price: number;
  oldPrice: number | null;
  cover: string | null;
  courseId: number | null;
  /**
   * ok: satın alınabilir · owned: erişim zaten var (program: zaten üye) · unavailable: kurs/program yayından kalkmış / bulunamadı / satışa kapalı ·
   * join: program üyesi değil ama ödenecek tutar 0 (ücretsiz katılım, siparişe girmez) · covered: sepetteki (ödenebilir) bir program bu kursu kapsıyor, ayrıca ödenmez
   */
  status: "ok" | "owned" | "unavailable" | "join" | "covered";
  /** Yalnızca program satırı: programs.id */
  programId: number | null;
  /** Yalnızca program satırı: kurs kurs döküm (indirimli fiyat, liste fiyatı, kullanıcıda var mı). */
  children?: { title: string; listPrice: number; price: number; owned: boolean }[];
  /**
   * Yalnızca status 'join' program satırı: kullanıcı TÜM kurslara gerçekten sahip (Plus hariç). `false` ise tutar 0 çünkü kurslar
   * sepetteki daha önceki bir programdan "edinilmiş" sayılıyor; o program alınmadan katılım butonu gösterilmez (endpoint de reddeder).
   */
  joinable?: boolean;
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
  const programLines = await quotePrograms(items, userId);
  // Ödenebilir (status "ok") programların kapsadığı kurslar: aynı sepetteki kurs satırları tekrar ödenmez.
  const coveredCourseIds = new Set<number>();
  for (const pl of programLines.values()) if (pl.line.status === "ok") for (const id of pl.courseIds) coveredCourseIds.add(id);

  for (const item of items) {
    const key = item.type === "plus" ? "plus" : `${item.type}:${item.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (item.type === "program") {
      lines.push(programLines.get(key)!.line);
      continue;
    }

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
        programId: null,
        status: "ok",
      });
      continue;
    }

    const course = await getCourseBySlug(item.slug);
    if (!course) {
      lines.push({ key, item, title: item.slug, subtitle: "Bu kurs artık satışta değil.", price: 0, oldPrice: null, cover: null, courseId: null, programId: null, status: "unavailable" });
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
      subtitle: `${course.instructor} · ${formatDuration(course.minutes)} · Ömür boyu erişim`,
      price: course.price,
      oldPrice: course.old_price,
      cover: coverUrl(course.thumbnail_url),
      courseId: course.id,
      programId: null,
      status: coveredCourseIds.has(course.id) ? "covered" : owned ? "owned" : "ok",
    });
  }

  const payable = lines.filter((l) => l.status === "ok");
  const total = Math.round(payable.reduce((s, l) => s + l.price, 0) * 100) / 100;
  return { lines, total, payable };
}

type ProgramQuote = { line: QuoteLine; courseIds: number[] };

/**
 * Sepetteki program kalemlerini sepet sırasıyla fiyatlar (`priceProgramsInOrder`): önceki programların kursları sonrakinde edinilmiş sayılır.
 * Edinilmiş küme `listOwnedCourseIds` (Plus kaynaklı kayıtlar hariç); girişsizde boş.
 */
async function quotePrograms(items: CartItem[], userId?: number | null): Promise<Map<string, ProgramQuote>> {
  const out = new Map<string, ProgramQuote>();
  const slugs = [...new Set(items.flatMap((i) => (i.type === "program" ? [i.slug] : [])))];
  if (slugs.length === 0) return out;

  const owned = userId ? await listOwnedCourseIds(userId) : new Set<number>();
  const offers = new Map<string, ProgramOffer | null>();
  for (const slug of slugs) offers.set(slug, await getProgramOffer(slug, null));

  const unavailable = (slug: string, offer: ProgramOffer | null): ProgramQuote => ({
    courseIds: [],
    line: {
      key: `program:${slug}`,
      item: { type: "program", slug },
      title: offer?.program.title ?? slug,
      subtitle: "Bu program artık satışta değil.",
      price: 0,
      oldPrice: null,
      cover: offer ? coverUrl(offer.program.thumbnail_url) : null,
      courseId: null,
      programId: offer?.program.id ?? null,
      status: "unavailable",
    },
  });

  // Satışa uygun programlar; üye olunanlar fiyatlamaya girmez (zaten ödenmeyecek, sonraki programların hesabını etkilemesin).
  const members = new Map<string, boolean>();
  const pricing: { slug: string; offer: ProgramOffer }[] = [];
  for (const slug of slugs) {
    const offer = offers.get(slug) ?? null;
    if (!offer || !offer.program.is_published || !offer.sellable) {
      out.set(`program:${slug}`, unavailable(slug, offer));
      continue;
    }
    const member = userId ? await isProgramMember(userId, offer.program.id) : false;
    members.set(slug, member);
    if (!member) pricing.push({ slug, offer });
  }
  const calcs = priceProgramsInOrder(
    pricing.map((p) => ({ price: p.offer.program.price, courses: p.offer.courses.map((c) => ({ id: c.id, price: c.price })) })),
    owned,
  );
  const calcBySlug = new Map<string, ProgramQuoteCalc>(pricing.map((p, i) => [p.slug, calcs[i]]));

  for (const slug of slugs) {
    if (out.has(`program:${slug}`)) continue;
    const offer = offers.get(slug)!;
    const calc = calcBySlug.get(slug);
    const n = offer.courses.length;
    const member = members.get(slug) === true;
    const status: QuoteLine["status"] = member ? "owned" : calc!.payable === 0 ? "join" : "ok";
    const shown = calc ?? offer.calc; // üyeyse fiyatlanmadı; döküm için kullanıcıdan bağımsız teklif yeterli
    out.set(`program:${slug}`, {
      courseIds: offer.courses.map((c) => c.id),
      line: {
        key: `program:${slug}`,
        item: { type: "program", slug },
        title: offer.program.title,
        subtitle: `${n} kurs · tamamlayınca program sertifikası`,
        price: status === "ok" ? calc!.payable : 0,
        oldPrice: calc ? calc.programPrice : offer.program.price,
        cover: coverUrl(offer.program.thumbnail_url),
        courseId: null,
        programId: offer.program.id,
        status,
        ...(status === "join" ? { joinable: offer.courses.every((c) => owned.has(c.id)) } : {}),
        children: offer.courses.map((c, i) => ({
          title: c.title,
          listPrice: shown.lines[i].listPrice,
          price: shown.lines[i].price,
          owned: calc ? calc.lines[i].owned : owned.has(c.id),
        })),
      },
    });
  }
  return out;
}

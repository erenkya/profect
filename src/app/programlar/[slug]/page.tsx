import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award } from "lucide-react";
import { Corners } from "@/components/Corners";
import { ProgramPricePanel } from "@/components/ProgramPricePanel";
import { getCurrentUser } from "@/lib/auth";
import { coverUrl } from "@/lib/cover-key";
import { formatDuration, formatPrice } from "@/lib/format";
import { ensureProgramProgress, getCourseStandings, getProgramBySlug, getProgramOffer, isProgramMember } from "@/lib/programs";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

type Props = { params: Promise<{ slug: string }> };

// Taslak programlar yalnızca admin için açılır; diğer herkes için 404.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await getCurrentUser();
  const program = await getProgramBySlug((await params).slug, { includeDraft: user?.role === "admin" });
  if (!program) return {};
  const cover = coverUrl(program.thumbnail_url);
  return { title: program.title, description: program.description, ...(cover && { openGraph: { images: [cover] } }) };
}

// Fiyat ve "sende" bilgisi kişiye özel: sayfa her istekte dinamik üretilir (getCurrentUser çerezi okur, önbelleğe alınmaz).
export default async function ProgramPage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const includeDraft = user?.role === "admin";
  // Tembel geriye dönük üretim (spec): tüm kursları (ör. Plus ile) bitirmiş ama henüz üye olmayan kullanıcıya üyelik + program
  // sertifikası burada yazılır; böylece zaten hak ettiği programın ücretli satın alımı önerilmez. Teklif bundan SONRA okunur.
  if (user) {
    const target = await getProgramBySlug(slug, { includeDraft });
    if (target?.is_published && !(await isProgramMember(user.id, target.id))) {
      try {
        await ensureProgramProgress(user.id, { programId: target.id });
      } catch (err) {
        console.error("ensureProgramProgress failed", err);
      }
    }
  }
  const offer = await getProgramOffer(slug, user?.id ?? null, { includeDraft });
  if (!offer) notFound();
  const { program, courses, calc } = offer;

  // Girişsizde hiçbir kurs "sende" gösterilmez: sahiplik, ilerleme ve sertifika yalnızca oturum açmış kullanıcı için okunur.
  const standings = user ? await getCourseStandings(user.id, courses.map((c) => c.id)) : null;
  let programCert: string | null = null;
  if (user && offer.member) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT certificate_code FROM program_certificates WHERE user_id = ? AND program_id = ?", [user.id, program.id]);
    programCert = rows[0]?.certificate_code ?? null;
  }
  const completed = standings ? courses.filter((c) => standings.get(c.id)?.certificate_code).length : 0;
  const minutes = courses.reduce((s, c) => s + c.minutes, 0);
  const cover = coverUrl(program.thumbnail_url);
  const joinable = !offer.member && offer.sellable && calc.payable === 0 && courses.length > 0 && calc.ownedCount === courses.length;

  return (
    <main>
      <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
        <div aria-hidden data-fx="1" data-py="0.25" data-rot="0.04" data-br="45" style={{ position: "absolute", right: -80, top: 40, width: 420, height: 420, border: "1px solid var(--color-accent-2-300)", transform: "rotate(45deg)" }} />
        <div className="wrap" style={{ position: "relative", paddingBlock: "40px 64px" }}>
          <nav aria-label="Konum" style={{ display: "flex", gap: 8, fontSize: 14, marginBottom: 40, color: "var(--muted-55)" }}>
            <Link href="/programlar" style={{ color: "inherit" }}>Programlar</Link>
            <span aria-hidden>/</span>
            <span>{program.category || "Uzmanlık Programı"}</span>
          </nav>
          <div style={{ maxWidth: 760 }}>
            <div data-reveal="1" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
              <span className="tag tag-accent">{program.code}</span>
              <span className="tag tag-neutral">{courses.length} kurs</span>
              <span className="tag tag-outline">Program sertifikalı</span>
              {!program.is_published && <span className="tag tag-neutral">Taslak</span>}
            </div>
            <h1 data-reveal="1" data-delay="100" style={{ fontSize: "clamp(48px,6vw,84px)", lineHeight: 0.94, textTransform: "uppercase", margin: "0 0 22px" }}>{program.title}</h1>
            <p data-reveal="1" data-delay="200" style={{ fontSize: 19, color: "color-mix(in srgb,var(--color-text) 74%,transparent)", textWrap: "pretty", marginBottom: 28 }}>{program.description}</p>
            <div data-reveal="1" data-delay="300" style={{ display: "flex", gap: 28, flexWrap: "wrap", fontSize: 15 }}>
              <span>{courses.length} kurs · {formatDuration(minutes)}</span>
              <span>Ayrı ayrı <strong style={{ fontWeight: 600 }}>{formatPrice(calc.listTotal)}</strong></span>
            </div>
            {cover && (
              <div data-reveal="1" data-delay="400" style={{ marginTop: 32, aspectRatio: "16 / 9", border: "1px solid var(--color-divider)", overflow: "hidden", background: "var(--color-divider)" }}>
                <img src={cover} alt={`${program.title} kapak resmi`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="wrap detail-grid" style={{ paddingBlock: "64px clamp(80px,10vw,140px)" }}>
        <div className="detail-main">
          <div data-reveal="1">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <h2 style={{ fontSize: 36, textTransform: "uppercase", margin: 0 }}>Yol haritası</h2>
              <span style={{ fontSize: 14, color: "var(--muted-55)" }}>Önerilen sıra, zorunlu değil</span>
            </div>
            <ol className="road">
              {courses.map((c, i) => {
                const line = calc.lines[i];
                const st = standings?.get(c.id);
                const done = !!st?.certificate_code;
                const have = !!user && line.owned;
                return (
                  <li key={c.id} className="road-row">
                    <span className="road-n">{String(i + 1).padStart(2, "0")}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="road-title">{c.is_published ? <Link href={`/kurslar/${c.slug}`}>{c.title}</Link> : c.title}</div>
                      <div className="road-meta">{formatDuration(c.minutes)}{done ? " · Sertifika alındı" : ""}</div>
                    </div>
                    <div className="road-side">
                      {have ? (
                        <span className="road-have">Sende · {done ? "tamamlandı" : `%${st?.percentage ?? 0}`}</span>
                      ) : (
                        <>
                          {/* Sertifikası olup kalıcı kaydı olmayan (Plus ile bitirilmiş) kurs "edinilmiş" sayılmaz: fiyat toplamı tutsun diye fiyatı gösterilir. */}
                          {done && <span className="road-have">Plus ile tamamladın</span>}
                          <span className="road-price">{formatPrice(line.price)}</span>
                          {line.listPrice > line.price && <span className="road-old">{formatPrice(line.listPrice)}</span>}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div data-reveal="1">
            <div className="card blueprint" style={{ padding: 24, gap: 10 }}>
              <Corners />
              <div className="card-kicker" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}><Award size={16} strokeWidth={1.5} aria-hidden /> Program sertifikası</div>
              <p className="card-body" style={{ fontSize: 16, margin: 0 }}>
                Her kursu kendi sertifikasıyla bitirirsin. Programdaki tüm kursların sertifikasını aldığında program sertifikan otomatik düzenlenir; kursları istediğin sırayla bitirebilirsin.
              </p>
            </div>
          </div>
        </div>

        <ProgramPricePanel
          slug={program.slug}
          loggedIn={!!user}
          member={offer.member}
          sellable={offer.sellable}
          payable={calc.payable}
          programPrice={calc.effectivePrice}
          listTotal={calc.listTotal}
          ownedCount={calc.ownedCount}
          ownedCredit={calc.credit}
          joinable={joinable}
          draft={!program.is_published}
          progress={offer.member ? { completed, total: courses.length, certificateCode: programCert } : undefined}
        />
      </section>
    </main>
  );
}

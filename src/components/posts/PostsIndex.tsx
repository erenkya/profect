import Link from "next/link";
import { Cta } from "@/components/Cta";
import { NewsRow } from "./NewsRow";
import { PostCard } from "./PostCard";
import { courseDelay } from "@/data/courses";
import { listPublishedPosts } from "@/lib/posts";
import { POST_TYPES, type PostType } from "@/lib/post-types";

const INTRO: Record<PostType, string> = {
  blog: "Öğrenme, sertifikasyon ve kariyer üzerine rehberler, ipuçları ve uzman görüşleri.",
  news: "Profect’ten yeni kurslar, duyurular ve sektörden güncel gelişmeler.",
};

/** /blog ve /haberler liste sayfaları. Blog kart ızgarası, haberler tarih sıralı liste olarak gösterilir. */
export async function PostsIndex({ type }: { type: PostType }) {
  const meta = POST_TYPES[type];
  const posts = await listPublishedPosts(type);
  const other = type === "blog" ? "news" : "blog";
  return (
    <>
      <main>
        <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
          <div aria-hidden data-fx="1" data-py="0.3" data-rot="0.05" data-br="45" style={{ position: "absolute", right: "6%", top: -60, width: 300, height: 300, border: "1px solid var(--color-accent-300)", transform: "rotate(45deg)" }} />
          <div aria-hidden data-fx="1" data-py="0.6" data-br="45" className="brand-diamond" style={{ position: "absolute", right: "calc(6% + 128px)", top: 88, width: 44, height: 44, transform: "rotate(45deg)" }} />
          <div className="wrap" style={{ position: "relative", paddingBlock: "clamp(56px,7vw,96px) 48px" }}>
            <div data-reveal="1" className="eyebrow">{type === "blog" ? "Blog" : "Haber merkezi"}</div>
            <h1 data-reveal="1" data-delay="100" style={{ fontSize: "clamp(56px,7vw,96px)", lineHeight: 0.92, textTransform: "uppercase", margin: "0 0 20px" }}>{meta.plural}</h1>
            <p data-reveal="1" data-delay="200" style={{ fontSize: 18, maxWidth: 560, color: "var(--muted-72)", marginBottom: 28 }}>{INTRO[type]}</p>
            <Link data-reveal="1" data-delay="300" href={POST_TYPES[other].path} className="btn btn-secondary" style={{ fontSize: 15, padding: "8px 16px" }}>{POST_TYPES[other].plural} →</Link>
          </div>
        </section>
        <section className="wrap" style={{ paddingBlock: "56px clamp(80px,10vw,140px)" }}>
          {posts.length === 0 ? (
            <p style={{ color: "var(--muted-55)" }}>{meta.empty}</p>
          ) : type === "blog" ? (
            <>
              <div style={{ fontSize: 13, color: "var(--muted-55)", marginBottom: 28 }}>{posts.length} yazı listeleniyor</div>
              <div className="course-grid">{posts.map((p, i) => <PostCard key={p.id} post={p} delay={courseDelay(i)} />)}</div>
            </>
          ) : (
            <div className="news-list">{posts.map((p, i) => <NewsRow key={p.id} post={p} delay={Math.min(i, 5) * 60} />)}</div>
          )}
        </section>
      </main>
      <Cta />
    </>
  );
}

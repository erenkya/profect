import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NewsRow } from "./NewsRow";
import { PostCard } from "./PostCard";
import { courseDelay } from "@/data/courses";
import type { PostListItem } from "@/lib/posts";
import { POST_TYPES } from "@/lib/post-types";

function Head({ eyebrow, title, type }: { eyebrow: string; title: string; type: "blog" | "news" }) {
  return (
    <div data-reveal="1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 48 }}>
      <div>
        <div className="eyebrow" style={type === "news" ? { color: "var(--color-accent-2-700)" } : undefined}>{eyebrow}</div>
        <h2 className="h-section">{title}</h2>
      </div>
      <Link href={POST_TYPES[type].path} className="btn btn-secondary" style={{ fontSize: 16, padding: "11px 20px" }}>
        {type === "blog" ? "Tüm yazılar" : "Tüm haberler"}
        <ArrowRight size={16} strokeWidth={1.5} />
      </Link>
    </div>
  );
}

/** Ana sayfa bölümü: son blog yazıları (kart) ve son haberler (liste). Hiç yayın yoksa bölüm gösterilmez. */
export function HomePosts({ blog, news }: { blog: PostListItem[]; news: PostListItem[] }) {
  if (blog.length === 0 && news.length === 0) return null;
  return (
    <section id="blog" className="anchor" style={{ borderTop: "1px solid var(--color-divider)" }}>
      <div className="wrap section-pad">
        {blog.length > 0 && (
          <>
            <Head eyebrow="05 — Blog" title="Öğren, ilham al, ilerle" type="blog" />
            <div className="course-grid">{blog.map((p, i) => <PostCard key={p.id} post={p} delay={courseDelay(i)} />)}</div>
          </>
        )}
        {news.length > 0 && (
          <div style={{ marginTop: blog.length > 0 ? "clamp(72px,8vw,120px)" : 0 }}>
            <Head eyebrow="06 — Haberler" title="Profect’ten son haberler" type="news" />
            <div className="news-list">{news.map((p, i) => <NewsRow key={p.id} post={p} delay={i * 60} />)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

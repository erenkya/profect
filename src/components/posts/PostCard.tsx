import Link from "next/link";
import { Corners } from "@/components/Corners";
import { BLUE, PURP } from "@/data/courses";
import type { PostListItem } from "@/lib/posts";
import { postImageUrl } from "@/lib/post-key";
import { POST_TYPES, formatPostDate, postHref } from "@/lib/post-types";

/** Kapağı olmayan yazılar için marka rengiyle geometrik yedek görsel. */
export function PostArtFallback({ type, label }: { type: PostListItem["type"]; label?: string }) {
  const color = type === "news" ? PURP : BLUE;
  return (
    <>
      <span className="diamond" style={{ position: "absolute", right: -30, top: -30, width: 170, height: 170, border: `1px solid ${color}` }} />
      <span className="diamond" style={{ position: "absolute", right: 34, top: 34, width: 30, height: 30, background: color }} />
      <div style={{ position: "absolute", left: 20, bottom: 14, fontFamily: "var(--font-heading)", fontSize: 40, lineHeight: 1, fontWeight: 700, color, textTransform: "uppercase" }}>
        {label ?? POST_TYPES[type].label}
      </div>
    </>
  );
}

export function PostCard({ post, delay = 0 }: { post: PostListItem; delay?: number }) {
  const cover = postImageUrl(post.cover_key);
  return (
    <div data-reveal="1" data-delay={delay}>
      <div className="card blueprint" style={{ background: "#fff", padding: 0, gap: 0, height: "100%" }}>
        <Corners />
        <Link href={postHref(post.type, post.slug)} className="post-link">
          <div className="post-art">{cover ? <img src={cover} alt="" loading="lazy" /> : <PostArtFallback type={post.type} />}</div>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="card-kicker" style={{ fontSize: 11 }}>{POST_TYPES[post.type].label}</span>
              <span className="card-meta" style={{ fontSize: 12 }}>{formatPostDate(post.published_at)}</span>
            </div>
            <div className="card-title" style={{ fontSize: 24, lineHeight: 1.1 }}>{post.title}</div>
            <p className="post-clamp" style={{ margin: 0, fontSize: 15, color: "var(--muted-72)" }}>{post.excerpt}</p>
            <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="card-meta" style={{ fontSize: 13 }}>{post.author} · {post.minutes} dk okuma</span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, color: "var(--color-accent)" }}>Oku →</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

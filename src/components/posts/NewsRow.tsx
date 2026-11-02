import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PostListItem } from "@/lib/posts";
import { postImageUrl } from "@/lib/post-key";
import { formatPostDate, postHref } from "@/lib/post-types";

/** Haber listesi satırı: tarih · başlık ve özet · küçük görsel. */
export function NewsRow({ post, delay = 0 }: { post: PostListItem; delay?: number }) {
  const cover = postImageUrl(post.cover_key);
  return (
    <Link href={postHref(post.type, post.slug)} className="news-row" data-reveal="1" data-delay={delay}>
      <div className="news-date">{formatPostDate(post.published_at)}</div>
      <div>
        <h3 style={{ fontSize: "clamp(22px,2.4vw,30px)", lineHeight: 1.1, margin: "0 0 8px", textTransform: "uppercase" }}>{post.title}</h3>
        <p className="post-clamp" style={{ margin: 0, fontSize: 15, color: "var(--muted-72)", maxWidth: 680, WebkitLineClamp: 2 }}>{post.excerpt}</p>
      </div>
      {cover ? <div className="news-thumb"><img src={cover} alt="" loading="lazy" /></div> : <ArrowRight size={22} strokeWidth={1.5} aria-hidden style={{ color: "var(--color-accent)" }} />}
    </Link>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Corners } from "@/components/Corners";
import { Cta } from "@/components/Cta";
import { PostCard } from "./PostCard";
import { PostMarkdown } from "./PostMarkdown";
import { courseDelay } from "@/data/courses";
import { getPublishedPost, listPublishedPosts } from "@/lib/posts";
import { postImageUrl } from "@/lib/post-key";
import { POST_TYPES, formatPostDate, type PostType } from "@/lib/post-types";

export async function postMetadata(type: PostType, slug: string): Promise<Metadata> {
  const post = await getPublishedPost(type, slug);
  if (!post) return {};
  const cover = postImageUrl(post.cover_key);
  return {
    title: post.title,
    description: post.excerpt,
    authors: [{ name: post.author }],
    openGraph: { type: "article", title: post.title, description: post.excerpt, ...(post.published_at && { publishedTime: post.published_at.replace(" ", "T") }), ...(cover && { images: [cover] }) },
  };
}

/** /blog/[slug] ve /haberler/[slug]: tek yazıyı bağımsız okuma sayfası olarak gösterir. */
export async function PostDetail({ type, slug }: { type: PostType; slug: string }) {
  const post = await getPublishedPost(type, slug);
  if (!post) notFound();
  const meta = POST_TYPES[type];
  const cover = postImageUrl(post.cover_key);
  const more = await listPublishedPosts(type, { limit: 3, exceptId: post.id });

  return (
    <>
      <main>
        <article>
          <header style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
            <div aria-hidden data-fx="1" data-py="0.3" data-rot="0.05" data-br="45" style={{ position: "absolute", right: "6%", top: -80, width: 300, height: 300, border: "1px solid var(--color-accent-300)", transform: "rotate(45deg)" }} />
            <div className="wrap" style={{ position: "relative", maxWidth: 960, paddingBlock: "clamp(40px,5vw,72px) clamp(36px,4vw,56px)" }}>
              <Link data-reveal="1" href={meta.path} className="btn btn-ghost" style={{ fontSize: 15, marginBottom: 28, marginLeft: "calc(var(--space-1) * -1)" }}>
                <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> {meta.plural}
              </Link>
              <div data-reveal="1" data-delay="60" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <span className={`tag ${type === "news" ? "tag-accent-2" : "tag-accent"}`}>{meta.label}</span>
                <span className="card-meta" style={{ fontSize: 14 }}>{formatPostDate(post.published_at)} · {post.minutes} dk okuma</span>
              </div>
              <h1 data-reveal="1" data-delay="120" style={{ fontSize: "clamp(40px,6vw,76px)", lineHeight: 0.95, textTransform: "uppercase", margin: "0 0 22px", textWrap: "balance" }}>{post.title}</h1>
              {post.excerpt && <p data-reveal="1" data-delay="200" className="post-lead" style={{ maxWidth: 680 }}>{post.excerpt}</p>}
              <div data-reveal="1" data-delay="260" style={{ marginTop: 26, fontSize: 14, color: "var(--muted-55)" }}>Yazan: <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{post.author}</strong></div>
            </div>
          </header>

          {cover && (
            <div className="wrap" style={{ maxWidth: 960, paddingBlock: "clamp(28px,4vw,48px) 0" }}>
              <div data-reveal="1" className="blueprint" style={{ background: "#fff", padding: 10 }}>
                <Corners />
                <div className="post-cover"><img src={cover} alt="" /></div>
              </div>
            </div>
          )}

          <div className="wrap" style={{ maxWidth: 960, paddingBlock: "clamp(36px,5vw,64px) clamp(64px,8vw,112px)" }}>
            <div className="md post-md"><PostMarkdown>{post.content}</PostMarkdown></div>
          </div>
        </article>

        {more.length > 0 && (
          <section style={{ borderTop: "1px solid var(--color-divider)", background: "var(--color-surface)" }}>
            <div className="wrap" style={{ paddingBlock: "clamp(56px,7vw,96px)" }}>
              <div data-reveal="1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20, marginBottom: 40 }}>
                <h2 className="h-section" style={{ fontSize: "clamp(32px,4vw,48px)" }}>Diğer {meta.plural.toLocaleLowerCase("tr-TR")}</h2>
                <Link href={meta.path} className="btn btn-secondary" style={{ fontSize: 15, padding: "9px 18px" }}>Tümünü gör</Link>
              </div>
              <div className="course-grid">{more.map((p, i) => <PostCard key={p.id} post={p} delay={courseDelay(i)} />)}</div>
            </div>
          </section>
        )}
      </main>
      <Cta />
    </>
  );
}

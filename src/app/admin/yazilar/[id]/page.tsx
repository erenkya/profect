import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/PostEditor";
import { parseId } from "@/lib/http";
import { getPostById } from "@/lib/posts";

export const metadata = { title: "Yazıyı düzenle" };

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const post = id ? await getPostById(id) : null;
  if (!post) notFound();
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 24px" }}>Yazıyı düzenle</h1>
      <PostEditor
        initial={{
          id: post.id, type: post.type, title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content,
          cover_key: post.cover_key, author: post.author, status: post.status, published_at: post.published_at?.slice(0, 16).replace(" ", "T") ?? "",
        }}
      />
    </>
  );
}

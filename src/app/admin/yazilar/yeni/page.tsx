import { PostEditor } from "@/components/admin/PostEditor";
import { requireAdminPage } from "@/lib/admin-guard";

export const metadata = { title: "Yeni yazı" };

export default async function NewPost({ searchParams }: { searchParams: Promise<{ tur?: string }> }) {
  const [user, { tur }] = await Promise.all([requireAdminPage(), searchParams]);
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 24px" }}>Yeni yazı</h1>
      <PostEditor initial={{ id: null, type: tur === "news" ? "news" : "blog", title: "", slug: "", excerpt: "", content: "", cover_key: null, author: user.full_name, status: "draft", published_at: "" }} />
    </>
  );
}

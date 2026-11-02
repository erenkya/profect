import type { Metadata } from "next";
import { PostsIndex } from "@/components/posts/PostsIndex";
import { POST_TYPES } from "@/lib/post-types";

export const metadata: Metadata = { title: POST_TYPES.news.plural, description: "Profect haberleri: yeni kurslar, duyurular ve sektörden gelişmeler." };

export default function Page() {
  return <PostsIndex type="news" />;
}

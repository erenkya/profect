import type { Metadata } from "next";
import { PostsIndex } from "@/components/posts/PostsIndex";
import { POST_TYPES } from "@/lib/post-types";

export const metadata: Metadata = { title: POST_TYPES.blog.plural, description: "Profect blog yazıları: öğrenme, sertifikasyon ve kariyer üzerine rehberler." };

export default function Page() {
  return <PostsIndex type="blog" />;
}

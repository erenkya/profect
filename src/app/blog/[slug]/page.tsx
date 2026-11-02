import { PostDetail, postMetadata } from "@/components/posts/PostDetail";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return postMetadata("blog", (await params).slug);
}

export default async function Page({ params }: Props) {
  return <PostDetail type="blog" slug={(await params).slug} />;
}

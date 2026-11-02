import { PostDetail, postMetadata } from "@/components/posts/PostDetail";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return postMetadata("news", (await params).slug);
}

export default async function Page({ params }: Props) {
  return <PostDetail type="news" slug={(await params).slug} />;
}

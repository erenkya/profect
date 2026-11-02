// Blog ve haber veri erişimi. Ham SQL — mysql2 havuzu.
import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import type { PostType } from "@/lib/post-types";
import { excerptFromMarkdown, readingMinutes, readingMinutesFromChars } from "@/lib/post-md";
import { extractPostImageKeys } from "@/lib/post-key";
import { deletePostImages } from "@/lib/r2";
import { uniqueSlug } from "@/lib/format";

export type PostListItem = {
  id: number;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  cover_key: string | null;
  author: string;
  status: "draft" | "published";
  published_at: string | null;
  minutes: number;
};

export type PostRow = PostListItem & { content: string; created_at: string; updated_at: string };

const LIST_COLUMNS = `id, type, slug, title, excerpt, cover_key, author, status, published_at, CHAR_LENGTH(content) AS content_len`;

function mapListItem(r: RowDataPacket): PostListItem {
  return {
    id: r.id,
    type: r.type,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    cover_key: r.cover_key,
    author: r.author,
    status: r.status,
    published_at: r.published_at,
    minutes: readingMinutesFromChars(Number(r.content_len ?? 0)),
  };
}

function mapPost(r: RowDataPacket): PostRow {
  return { ...mapListItem({ ...r, content_len: 0 }), minutes: readingMinutes(r.content), content: r.content, created_at: r.created_at, updated_at: r.updated_at };
}

/** Yayındaki yazılar, en yeni önce. `exceptId` ile bir yazı (ör. okunmakta olan) dışarıda bırakılır. */
export async function listPublishedPosts(type: PostType, opts: { limit?: number; exceptId?: number } = {}): Promise<PostListItem[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${LIST_COLUMNS} FROM posts WHERE type = ? AND status = 'published' AND id <> ? ORDER BY published_at DESC, id DESC LIMIT ?`,
    [type, opts.exceptId ?? 0, opts.limit ?? 100],
  );
  return rows.map(mapListItem);
}

export async function getPublishedPost(type: PostType, slug: string): Promise<PostRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM posts WHERE type = ? AND slug = ? AND status = 'published'", [type, slug]);
  return rows[0] ? mapPost(rows[0]) : null;
}

export async function listAllPosts(): Promise<PostListItem[]> {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${LIST_COLUMNS} FROM posts ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 500`);
  return rows.map(mapListItem);
}

export async function getPostById(id: number): Promise<PostRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM posts WHERE id = ?", [id]);
  return rows[0] ? mapPost(rows[0]) : null;
}

/** Başlıktan türeyen adres aynı türde varsa -2, -3… ekler. */
export async function freePostSlug(type: PostType, base: string, exceptId = 0): Promise<string> {
  const root = base || "yazi";
  const [rows] = await pool.query<RowDataPacket[]>("SELECT slug FROM posts WHERE type = ? AND id <> ? AND (slug = ? OR slug LIKE ?)", [type, exceptId, root, `${root.replace(/[\\%_]/g, "\\$&")}-%`]);
  return uniqueSlug(root, rows.map((r) => r.slug as string));
}

export type PostInput = {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_key: string | null;
  author: string;
  status: "draft" | "published";
  published_at: string | null;
};

/** Boş özet içerikten üretilir; yayına alınırken tarih boşsa şimdi atanır. */
function normalize(d: PostInput) {
  return {
    ...d,
    excerpt: d.excerpt || excerptFromMarkdown(d.content),
    published_at: d.published_at?.replace("T", " ") ?? null,
  };
}

export async function createPost(input: PostInput): Promise<number> {
  const d = normalize(input);
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO posts (type, slug, title, excerpt, content, cover_key, author, status, published_at)
     VALUES (?,?,?,?,?,?,?,?, COALESCE(?, IF(? = 'published', NOW(), NULL)))`,
    [d.type, d.slug, d.title, d.excerpt, d.content, d.cover_key, d.author, d.status, d.published_at, d.status],
  );
  return res.insertId;
}

export async function updatePost(id: number, input: PostInput): Promise<boolean> {
  const d = normalize(input);
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE posts SET type = ?, slug = ?, title = ?, excerpt = ?, content = ?, cover_key = ?, author = ?, status = ?,
            published_at = COALESCE(?, IF(? = 'published', NOW(), NULL))
      WHERE id = ?`,
    [d.type, d.slug, d.title, d.excerpt, d.content, d.cover_key, d.author, d.status, d.published_at, d.status, id],
  );
  return res.affectedRows > 0;
}

/** Yazıyı ve içinde/kapağında kullanılan görselleri siler. */
export async function deletePost(id: number): Promise<boolean> {
  const post = await getPostById(id);
  if (!post) return false;
  await pool.execute("DELETE FROM posts WHERE id = ?", [id]);
  await deletePostImages(extractPostImageKeys(post.content, post.cover_key));
  return true;
}

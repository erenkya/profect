"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Corners } from "@/components/Corners";
import { slugify } from "@/lib/format";
import { parseMarkdownFile } from "@/lib/post-md";
import { POST_TYPES, postHref, type PostType } from "@/lib/post-types";
import { MarkdownEditor } from "./MarkdownEditor";
import { PostCoverField } from "./PostCoverField";
import { Toast, useFlash } from "./Toast";
import { adminApi } from "./api";

export type PostEditorValue = {
  id: number | null; // null = yeni yazı
  type: PostType;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_key: string | null;
  author: string;
  status: "draft" | "published";
  published_at: string; // "YYYY-MM-DDTHH:mm" ya da boş
};

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function PostEditor({ initial }: { initial: PostEditorValue }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [content, setContent] = useState(initial.content);
  // Düzenlerken adres sabit kalır; yeni yazıda başlıktan türer, elle değiştirilince bırakılır.
  const [slugTouched, setSlugTouched] = useState(initial.id !== null);
  const [uploads, setUploads] = useState({ cover: false, content: false });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();
  const uploading = uploads.cover || uploads.content;
  const input = { background: "#fff", fontSize: 15, minHeight: 40 } as const;
  const set = <K extends keyof PostEditorValue>(k: K, v: PostEditorValue[K]) => setF((p) => ({ ...p, [k]: v }));

  function setTitle(title: string) {
    setF((p) => ({ ...p, title, ...(slugTouched ? {} : { slug: slugify(title).slice(0, 120) }) }));
  }

  function setStatus(status: "draft" | "published") {
    setF((p) => ({ ...p, status, published_at: status === "published" && !p.published_at ? nowLocal() : p.published_at }));
  }

  function importMarkdown(text: string, fileName: string) {
    const p = parseMarkdownFile(text);
    setContent(p.content);
    setF((cur) => {
      const title = p.title || cur.title || fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      return {
        ...cur,
        title,
        excerpt: p.excerpt || cur.excerpt,
        author: p.author || cur.author,
        type: p.type ?? cur.type,
        published_at: p.publishedAt ?? cur.published_at,
        ...(slugTouched ? {} : { slug: slugify(title).slice(0, 120) }),
      };
    });
    setFlash({ kind: "ok", text: `${fileName} içe aktarıldı. Kontrol edip kaydedin.` });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    const body = {
      type: f.type, title: f.title, slug: f.slug, excerpt: f.excerpt, content, cover_key: f.cover_key, author: f.author,
      status: f.status, published_at: f.published_at || null,
    };
    const r = f.id === null ? await adminApi("POST", "/api/admin/posts", body) : await adminApi("PATCH", `/api/admin/posts/${f.id}`, body);
    setBusy(false);
    if (!r.ok) return setFlash({ kind: "error", text: r.message });
    if (f.id === null) return router.replace(`/admin/yazilar/${r.json.postId}`);
    setFlash({ kind: "ok", text: "Kaydedildi." });
    router.refresh();
  }

  async function remove() {
    if (f.id === null || !window.confirm(`“${f.title}” silinsin mi? Yazı ve içindeki görseller kalıcı olarak silinir.`)) return;
    setBusy(true);
    const r = await adminApi("DELETE", `/api/admin/posts/${f.id}`);
    if (!r.ok) {
      setBusy(false);
      return setFlash({ kind: "error", text: r.message });
    }
    router.replace("/admin/yazilar");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card blueprint" style={{ background: "#fff", padding: "clamp(16px,3vw,28px)", gap: 18, maxWidth: 980 }}>
      <Corners />
      <div className="field">
        <label>Tür</label>
        <div className="seg" role="group" aria-label="Tür">
          {(Object.keys(POST_TYPES) as PostType[]).map((t) => (
            <label key={t} className="seg-opt"><input type="radio" name="post-type" checked={f.type === t} onChange={() => set("type", t)} />{POST_TYPES[t].label}</label>
          ))}
        </div>
      </div>
      <div className="field"><label htmlFor="post-title">Başlık</label><input id="post-title" className="input" required maxLength={200} value={f.title} onChange={(e) => setTitle(e.target.value)} style={input} /></div>
      <div className="form-row" style={{ "--cols": "1fr 1fr", gap: 12 } as React.CSSProperties}>
        <div className="field">
          <label htmlFor="post-slug">Adres (slug){f.slug && <span style={{ color: "var(--muted-55)" }}> · {POST_TYPES[f.type].path}/{f.slug}</span>}</label>
          <input id="post-slug" className="input" required pattern="[a-z0-9\-]+" minLength={2} maxLength={160} value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} style={input} />
        </div>
        <div className="field"><label htmlFor="post-author">Yazar</label><input id="post-author" className="input" required maxLength={150} value={f.author} onChange={(e) => set("author", e.target.value)} style={input} /></div>
      </div>
      <div className="field">
        <label htmlFor="post-excerpt">Özet <span style={{ color: "var(--muted-55)" }}>· {f.excerpt.length}/400 · boş bırakırsanız içerikten üretilir</span></label>
        <textarea id="post-excerpt" className="input" rows={3} maxLength={400} value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} style={{ background: "#fff", fontSize: 15 }} />
      </div>
      <PostCoverField value={f.cover_key} onChange={(k) => set("cover_key", k)} onBusyChange={(b) => setUploads((u) => ({ ...u, cover: b }))} />
      <MarkdownEditor value={content} setValue={setContent} onImportFile={importMarkdown} onError={(text) => setFlash({ kind: "error", text })} onBusyChange={(b) => setUploads((u) => ({ ...u, content: b }))} />
      <div className="form-row" style={{ "--cols": "1fr 1fr", gap: 12, alignItems: "end" } as React.CSSProperties}>
        <div className="field">
          <label>Durum</label>
          <div className="seg" role="group" aria-label="Durum">
            <label className="seg-opt"><input type="radio" name="post-status" checked={f.status === "draft"} onChange={() => setStatus("draft")} />Taslak</label>
            <label className="seg-opt"><input type="radio" name="post-status" checked={f.status === "published"} onChange={() => setStatus("published")} />Yayında</label>
          </div>
        </div>
        <div className="field"><label htmlFor="post-date">Yayın tarihi</label><input id="post-date" className="input" type="datetime-local" value={f.published_at} onChange={(e) => set("published_at", e.target.value)} style={input} /></div>
      </div>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" disabled={busy || uploading} className="btn btn-primary blueprint"><Corners />{uploading ? "Görsel yükleniyor…" : busy ? "Kaydediliyor…" : f.id === null ? "Oluştur" : "Kaydet"}</button>
        <Link href="/admin/yazilar" className="btn btn-secondary">Listeye dön</Link>
        {f.id !== null && f.status === "published" && <Link href={postHref(f.type, f.slug)} target="_blank" className="btn btn-ghost">Sayfayı aç ↗</Link>}
        <span style={{ flex: 1 }} />
        {f.id !== null && <button type="button" className="btn btn-ghost" style={{ color: "#b00020" }} disabled={busy} onClick={remove}>Sil</button>}
      </div>
    </form>
  );
}

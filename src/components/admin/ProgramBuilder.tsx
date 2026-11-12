"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Corners } from "@/components/Corners";
import { Toast, useFlash } from "./Toast";
import { adminApi } from "./api";
import { CategoryField } from "./CategoryField";
import { CoverUploadField } from "./CoverUploadField";
import { ProgramVideoField } from "./ProgramVideoField";
import { formatPrice } from "@/lib/format";
import { courseProblems, priceProblem, type CourseEligibility } from "@/lib/program-rules";
import type { ProgramRow } from "@/lib/programs";

type Props = {
  program?: ProgramRow; // yoksa "yeni program" formu
  courses?: CourseEligibility[]; // programın kursları, program içi sırayla
  memberCount?: number; // programın üye sayısı (program_enrollments)
  options: CourseEligibility[]; // kurs seçici: yayındaki kurslar
  categories: string[];
};

const input = { background: "#fff", fontSize: 15, minHeight: 38 } as const;
const iconBtn = { width: 32, height: 32 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Program oluşturma (program yok) ve düzenleme: bilgiler, kurs ekle-çıkar-sırala, canlı fiyat özeti. */
export function ProgramBuilder({ program, courses = [], memberCount = 0, options, categories }: Props) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();
  const [open, setOpen] = useState(!!program);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: program?.title ?? "", description: program?.description ?? "", category: program?.category ?? "", price: program ? String(program.price) : "" });
  const [thumbnail, setThumbnail] = useState<string | null>(program?.thumbnail_url ?? null);
  const [coverBusy, setCoverBusy] = useState(false); // kapak yüklenirken kaydetme kapalı
  const [introVideo, setIntroVideo] = useState<string | null>(program?.intro_video_key ?? null);
  const [videoBusy, setVideoBusy] = useState(false); // video yüklenirken kaydetme kapalı
  const [rows, setRows] = useState<CourseEligibility[]>(courses);
  const [pick, setPick] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const listTotal = round2(rows.reduce((s, c) => s + c.price, 0)); // S
  const price = Number(f.price) || 0; // B
  const overPrice = rows.length > 0 ? priceProblem(price, rows) : null; // B > S: fiyat ya da kurs listesi değişen kaydı engeller
  // Kayıtta yalnızca değişen alanlar gönderilir: kurs fiyatı düşüp B > S olmuş ya da bir kursu sorunlu hâle gelmiş programda
  // alakasız bir düzenleme (başlık vb.) sunucuda fiyat/kurs denetimine takılmasın.
  const coursesChanged = !program || rows.length !== courses.length || rows.some((c, i) => c.id !== courses[i].id);
  const priceTouched = coursesChanged || (!!program && price !== program.price);
  const discount = listTotal > 0 && !overPrice ? Math.round((1 - price / listTotal) * 1000) / 10 : 0;
  const problems = rows.length > 0 ? courseProblems(rows) : [];
  const available = options.filter((o) => !rows.some((r) => r.id === o.id));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  function addPicked() {
    const c = options.find((o) => String(o.id) === pick);
    if (c) setRows([...rows, c]);
    setPick("");
  }

  async function save(e: React.FormEvent, published = program?.is_published ?? false) {
    e.preventDefault();
    const unpublishing = !!program?.is_published && !published; // yayından kaldırma her zaman mümkün
    if (unpublishing) {
      setBusy(true);
      const r = await adminApi("PATCH", `/api/admin/programs/${program.id}`, { is_published: false });
      setBusy(false);
      setFlash({ kind: r.ok ? "ok" : "error", text: r.ok ? "Program yayından kaldırıldı." : r.message });
      if (r.ok) router.refresh();
      return;
    }
    if (e.currentTarget instanceof HTMLButtonElement && !e.currentTarget.form?.reportValidity()) return;
    if (rows.length === 0) return setFlash({ kind: "error", text: "Programa en az bir kurs ekleyin." });
    if (overPrice && (priceTouched || published)) return setFlash({ kind: "error", text: overPrice });
    setBusy(true);
    const course_ids = rows.map((c) => c.id);
    if (!program) {
      const r = await adminApi("POST", "/api/admin/programs", { title: f.title, description: f.description, category: f.category, price, course_ids });
      setBusy(false);
      if (r.ok) router.push(`/admin/programlar/${r.json.programId}`);
      else setFlash({ kind: "error", text: r.message });
      return;
    }
    const body = {
      ...(f.title !== program.title && { title: f.title }),
      ...(f.description !== program.description && { description: f.description }),
      ...(f.category !== program.category && { category: f.category }),
      ...(thumbnail !== program.thumbnail_url && { thumbnail_url: thumbnail }),
      ...(introVideo !== program.intro_video_key && { intro_video_key: introVideo }),
      ...(price !== program.price && { price }),
      ...(coursesChanged && { course_ids }),
      ...(published !== program.is_published && { is_published: published }),
    };
    if (Object.keys(body).length === 0) {
      setBusy(false);
      return setFlash({ kind: "ok", text: "Değişiklik yok." });
    }
    const r = await adminApi("PATCH", `/api/admin/programs/${program.id}`, body);
    setBusy(false);
    setFlash({ kind: r.ok ? "ok" : "error", text: r.ok ? (published === program.is_published ? "Program kaydedildi." : "Program yayınlandı.") : r.message });
    if (r.ok) router.refresh();
  }

  if (!open) return <button className="btn btn-primary blueprint" onClick={() => setOpen(true)}><Corners />Yeni program</button>;

  return (
    <form onSubmit={save} className="card blueprint" style={{ background: "#fff", padding: 24, gap: 16, marginBottom: program ? 0 : 32 }}>
      <Corners />
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: program ? 40 : 28, textTransform: "uppercase", margin: 0 }}>{program ? program.title : "Yeni program"}</h1>
        {program && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`tag ${program.is_published ? "tag-accent" : "tag-neutral"}`}>{program.is_published ? "Yayında" : "Taslak"}</span>
            {program.is_published ? (
              <button type="button" className="btn btn-secondary" disabled={busy || coverBusy || videoBusy} onClick={(e) => save(e, false)}>Yayından kaldır</button>
            ) : (
              <button
                type="button"
                className="btn btn-primary blueprint"
                disabled={busy || coverBusy || videoBusy || !!overPrice || problems.length > 0}
                onClick={(e) => save(e, true)}
                style={{ fontSize: 18, padding: "14px 28px", background: "var(--color-accent-2)", borderColor: "var(--color-accent-2)", boxShadow: "0 6px 18px color-mix(in srgb, var(--color-accent-2) 35%, transparent)" }}
              >
                <Corners />Yayınla
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <div className="field"><label>Başlık</label><input className="input" required value={f.title} onChange={set("title")} style={input} /></div>
        <div className="field"><label htmlFor="pb-cat">Kategori</label><CategoryField id="pb-cat" categories={categories} value={f.category} onChange={(category) => setF({ ...f, category })} style={input} /></div>
        <div className="field"><label htmlFor="pb-price">Program fiyatı (₺)</label><input id="pb-price" className="input" type="number" required min={0} step="0.01" value={f.price} onChange={set("price")} style={input} /></div>
      </div>
      <div className="field"><label>Açıklama</label><textarea className="input" required rows={3} value={f.description} onChange={set("description")} style={{ background: "#fff", fontSize: 15 }} /></div>

      {program ? (
        <>
          <CoverUploadField target={{ program_id: program.id }} value={thumbnail} onChange={setThumbnail} onBusyChange={setCoverBusy} />
          <ProgramVideoField programId={program.id} value={introVideo} onChange={setIntroVideo} onBusyChange={setVideoBusy} />
        </>
      ) : (
        <p style={{ fontSize: 13, color: "var(--muted-55)", margin: 0 }}>Kapak resmi ve tanıtım videosu, program oluşturulduktan sonra düzenleme ekranından eklenir.</p>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="card-kicker">Kurslar · yol haritası sırası</div>
        {rows.map((c, i) => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", border: "1px solid var(--color-divider)", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, color: "var(--color-accent)", minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ flex: 1, fontSize: 15, minWidth: 160 }}>{c.title} <span style={{ color: "var(--muted-55)" }}>· {formatPrice(c.price)}</span></span>
            {!c.is_published && <span className="tag tag-accent-2">Yayında değil</span>}
            {!c.has_final_quiz && <span className="tag tag-accent-2">Final sınavı yok</span>}
            <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} aria-label="Yukarı taşı" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={15} strokeWidth={1.5} /></button>
            <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} aria-label="Aşağı taşı" onClick={() => move(i, 1)} disabled={i === rows.length - 1}><ArrowDown size={15} strokeWidth={1.5} /></button>
            <button type="button" className="btn btn-icon btn-ghost" style={iconBtn} aria-label="Programdan çıkar" onClick={() => setRows(rows.filter((r) => r.id !== c.id))}><Trash2 size={15} strokeWidth={1.5} /></button>
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: "var(--muted-55)", fontSize: 14, margin: 0 }}>Henüz kurs eklenmedi.</p>}
        {program?.is_published && memberCount > 0 && (
          <div role="note" style={{ fontSize: 14, padding: 10, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>
            Bu programın {memberCount} üyesi var. Yeni eklenen kurslar mevcut üyelere otomatik verilmez; üyeler programı tamamlamak için eklenen kursu ayrıca satın almalı.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select className="input" aria-label="Eklenecek kurs" value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...input, flex: 1, minWidth: 220, maxWidth: 520 }}>
            <option value="">Kurs seçin (yalnızca yayındaki kurslar)</option>
            {available.map((o) => <option key={o.id} value={o.id} disabled={!o.has_final_quiz}>{o.title} · {formatPrice(o.price)}{o.has_final_quiz ? "" : " (final sınavı yok)"}</option>)}
          </select>
          <button type="button" className="btn btn-secondary" disabled={!pick} onClick={addPicked}>Kurs ekle</button>
        </div>
      </section>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: 12, background: "var(--color-accent-100)", fontSize: 15 }} aria-live="polite">
        <span>Ayrı ayrı toplam (S): <b>{formatPrice(listTotal)}</b></span>
        <span>Program fiyatı (B): <b>{formatPrice(price)}</b></span>
        <span>İndirim: <b>%{discount.toLocaleString("tr-TR")}</b></span>
      </div>
      {overPrice && <div role="alert" style={{ color: "#b00020", fontSize: 14 }}>{overPrice} {priceTouched || !program?.is_published ? "Kaydedilemez; fiyatı düşürün." : "Yayından kaldırabilir ya da fiyatı düşürebilirsiniz."}</div>}
      {program && problems.length > 0 && (
        <div style={{ fontSize: 14, color: "var(--muted-72)" }}>
          <b>{program.is_published ? "Dikkat, program satışa kapalı (kurs listesini değiştirirken düzeltilmeli):" : "Yayınlamadan önce:"}</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>{problems.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary blueprint" disabled={busy || coverBusy || videoBusy || (!!overPrice && priceTouched)}><Corners />{busy ? "Kaydediliyor…" : program ? "Kaydet" : "Oluştur ve düzenle"}</button>
        {!program && <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Vazgeç</button>}
        {program && <Link href={`/programlar/${program.slug}`} className="btn btn-secondary">{program.is_published ? "Sayfayı gör" : "Önizle"}</Link>}
      </div>
      {!program && <p style={{ fontSize: 12, color: "var(--muted-55)", margin: 0 }}>Program taslak olarak oluşturulur; kurslar yayında ve final sınavlı olunca yayınlayın.</p>}
    </form>
  );
}

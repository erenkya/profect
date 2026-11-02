"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Bold, Eye, FileUp, Heading2, ImagePlus, Italic, Link2, List, Pencil, Quote } from "lucide-react";
import { PostMarkdown } from "@/components/posts/PostMarkdown";
import { POST_IMAGE_TYPES, isPostImageType, postImageUrl } from "@/lib/post-key";
import { uploadPostImage } from "./post-image-upload";

type Props = {
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
  /** Bir .md dosyası seçilince/bırakılınca ham metinle çağrılır; içeriği ve alanları çağıran uygular. */
  onImportFile: (text: string, fileName: string) => void;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void; // görsel yüklenirken formun "Kaydet"i kapatılır
};

const MAX_MD_BYTES = 1_000_000;
const isMdFile = (f: File) => /\.(md|markdown|txt)$/i.test(f.name) || f.type === "text/markdown";

/**
 * Markdown düzenleyici. Görsel; araç çubuğundan seçilerek, panodan yapıştırılarak ya da sürüklenip bırakılarak
 * imlecin olduğu yere eklenir (önce "Yükleniyor…" yer tutucusu konur, yükleme bitince gerçek adresle değişir).
 * Bir .md dosyası seçilebilir ya da kutuya bırakılabilir.
 */
export function MarkdownEditor({ value, setValue, onImportFile, onError, onBusyChange }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const sel = useRef({ start: 0, end: 0 });
  const seq = useRef(0);
  const inflight = useRef(0);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dragging, setDragging] = useState(false);

  const remember = () => {
    const ta = area.current;
    if (ta) sel.current = { start: ta.selectionStart, end: ta.selectionEnd };
  };

  function put(next: SetStateAction<string>, caret: number) {
    setValue(next);
    sel.current = { start: caret, end: caret };
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(caret, caret);
    });
  }

  function insert(text: string) {
    const { start, end } = sel.current;
    put((v) => v.slice(0, start) + text + v.slice(end), start + text.length);
  }

  /** Seçili metni before/after ile sarar; seçim yoksa `placeholder`'ı sarıp seçili bırakır. */
  function wrap(before: string, after: string, placeholder: string) {
    const { start, end } = sel.current;
    const chosen = value.slice(start, end) || placeholder;
    put((v) => v.slice(0, start) + before + chosen + after + v.slice(end), start + before.length + chosen.length);
  }

  /** Satır başına önek koyar (başlık, liste, alıntı). */
  function linePrefix(prefix: string) {
    const { start } = sel.current;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    put((v) => v.slice(0, lineStart) + prefix + v.slice(lineStart), start + prefix.length);
  }

  async function addImages(files: File[]) {
    for (const file of files) {
      if (!isPostImageType(file.type)) {
        onError(`${file.name}: yalnızca JPG, PNG, WebP veya GIF eklenebilir.`);
        continue;
      }
      const id = ++seq.current;
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/[[\]()]/g, "").trim() || "görsel";
      const placeholder = `![Yükleniyor… ${id}](#yukleniyor-${id})`;
      const { start } = sel.current;
      const lead = start > 0 && value.slice(Math.max(0, start - 2), start) !== "\n\n" ? "\n\n" : "";
      insert(`${lead}${placeholder}\n\n`);
      inflight.current++;
      onBusyChange(true);
      try {
        const url = postImageUrl(await uploadPostImage(file));
        setValue((v) => v.replace(placeholder, () => `![${alt}](${url})`));
      } catch (err) {
        setValue((v) => v.replace(`${placeholder}\n\n`, () => "").replace(placeholder, () => ""));
        onError(`${file.name}: ${err instanceof Error ? err.message : "yükleme başarısız."}`);
      } finally {
        if (--inflight.current === 0) onBusyChange(false);
      }
    }
  }

  async function importFile(file: File) {
    if (file.size > MAX_MD_BYTES) return onError("Markdown dosyası en çok 1 MB olabilir.");
    if (value.trim() && !window.confirm("Mevcut içerik bu dosyanın içeriğiyle değiştirilsin mi?")) return;
    onImportFile(await file.text(), file.name);
  }

  function handleFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const md = files.find(isMdFile);
    if (md) void importFile(md);
    if (images.length) void addImages(images);
  }

  const tool = (label: string, icon: React.ReactNode, run: () => void) => (
    <button key={label} type="button" className="btn btn-secondary btn-icon" aria-label={label} title={label} onClick={run} disabled={tab === "preview"}>{icon}</button>
  );

  return (
    <div className="field">
      <label htmlFor="post-content">İçerik (Markdown)</label>
      <div className="post-editor-bar">
        <div className="seg" role="group" aria-label="Görünüm">
          <label className="seg-opt"><input type="radio" name="md-tab" checked={tab === "write"} onChange={() => setTab("write")} /><Pencil size={14} aria-hidden /> Yaz</label>
          <label className="seg-opt"><input type="radio" name="md-tab" checked={tab === "preview"} onChange={() => setTab("preview")} /><Eye size={14} aria-hidden /> Önizle</label>
        </div>
        {tool("Başlık", <Heading2 size={16} aria-hidden />, () => linePrefix("## "))}
        {tool("Kalın", <Bold size={16} aria-hidden />, () => wrap("**", "**", "kalın metin"))}
        {tool("İtalik", <Italic size={16} aria-hidden />, () => wrap("_", "_", "italik metin"))}
        {tool("Bağlantı", <Link2 size={16} aria-hidden />, () => wrap("[", "](https://)", "bağlantı metni"))}
        {tool("Liste", <List size={16} aria-hidden />, () => linePrefix("- "))}
        {tool("Alıntı", <Quote size={16} aria-hidden />, () => linePrefix("> "))}
        <span style={{ flex: 1 }} />
        <label className="btn btn-secondary" style={{ cursor: "pointer", fontSize: 14 }} onMouseDown={remember}>
          <ImagePlus size={16} aria-hidden /> Görsel ekle
          <input type="file" multiple accept={Object.keys(POST_IMAGE_TYPES).join(",")} hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void addImages(fs); }} />
        </label>
        <label className="btn btn-secondary" style={{ cursor: "pointer", fontSize: 14 }}>
          <FileUp size={16} aria-hidden /> .md yükle
          <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
        </label>
      </div>

      {tab === "write" ? (
        <div className="post-editor-area" data-drop={dragging}>
          <textarea
            id="post-content"
            ref={area}
            className="input"
            value={value}
            spellCheck
            placeholder={"## Başlık\n\nMetninizi Markdown ile yazın. Görseli yapıştırabilir ya da buraya sürükleyebilirsiniz."}
            onChange={(e) => { setValue(e.target.value); remember(); }}
            onSelect={remember}
            onBlur={remember}
            onPaste={(e) => {
              const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
              if (files.length) { e.preventDefault(); remember(); void addImages(files); }
            }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              setDragging(false);
              const files = [...e.dataTransfer.files];
              if (!files.length) return;
              e.preventDefault();
              handleFiles(files);
            }}
          />
        </div>
      ) : (
        <div className="post-editor-preview">
          {value.trim() ? <div className="md post-md"><PostMarkdown>{value}</PostMarkdown></div> : <p style={{ color: "var(--muted-55)", margin: 0 }}>Önizlenecek içerik yok.</p>}
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--muted-55)", margin: "6px 0 0" }}>
        Görsel: yapıştırın, sürükleyin ya da “Görsel ekle” — imlecin olduğu yere eklenir. .md dosyası: “.md yükle” ya da kutuya bırakın; dosyanın başındaki <code>title</code>, <code>excerpt</code>, <code>author</code>, <code>type</code>, <code>date</code> alanları forma aktarılır.
      </p>
    </div>
  );
}

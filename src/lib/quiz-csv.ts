// Sınav CSV içe aktarma: şablon üretimi ve CSV → editör soruları. Saf modül (istemci).
// Doğrulama quizItemSchema ile yapılır; böylece editör/sunucu kuralları ile CSV kuralları ayrışmaz.

import { quizItemSchema } from "./admin-schemas.ts";
import { toEditor, type EditorItem } from "./quiz-editor.ts";

export const CSV_COLUMNS = ["tip", "senaryo", "soru", "senaryo_sorusu", "secenekler", "dogru", "aciklama"] as const;
const REQUIRED = ["tip", "soru", "secenekler", "dogru"];
export const MAX_IMPORT_QUESTIONS = 200;

export type CsvResult = { ok: true; items: EditorItem[] } | { ok: false; errors: string[] };

type Kind = "single" | "multiple" | "categorize" | "scenario";
const KINDS: Record<string, Kind> = {
  tek: "single", single: "single", tekcevapli: "single",
  coklu: "multiple", multiple: "multiple", cokcevapli: "multiple",
  suruklebirak: "categorize", categorize: "categorize",
  senaryo: "scenario", scenario: "scenario",
};

/** Küçük harf, aksansız, Türkçe karakterleri ASCII'ye indirgenmiş (başlık ve tip eşleştirmesi için). */
const fold = (s: string) => s.trim().toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i");

// — Şablon —

const esc = (v: string) => (/[",;\t\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const TEMPLATE_NOTES = [
  "# Bu # satırları ve aşağıdaki örnek sorular silinip yerine yenileri yazılmalı; # ile başlayan satırlar yüklenirken yok sayılır.",
  "# Her satır bir sorudur. tip: tek | coklu | suruklebirak | senaryo. Dosya UTF-8 CSV, ayırıcı virgül; metinde virgül varsa alan çift tırnak içine alınır.",
  "# secenekler: şıklar | ile ayrılır (tek/coklu: 2-12 şık). suruklebirak'ta her kart 'kart metni => kategori' biçiminde yazılır (2-8 kategori, 2-30 kart).",
  "# dogru: tek için doğru şıkkın numarası (2), coklu için numaralar ; ile (1;3). suruklebirak ve senaryo satırlarında boş bırakılır.",
  "# senaryo: senaryo satırına bir kod (S1) yazılır, soru sütunu senaryo metnidir. Alt sorular (yalnızca tek/coklu) aynı kodu senaryo sütununda taşır ve senaryo satırının altına yazılır.",
  "# senaryo_sorusu yalnızca senaryo satırında ve isteğe bağlıdır; aciklama (yanlış cevaplayana gösterilir) isteğe bağlıdır.",
];

const TEMPLATE_ROWS: string[][] = [
  ["tek", "", "Türkiye'nin başkenti neresidir?", "", "İstanbul|Ankara|İzmir|Bursa", "2", "Başkent 1923'ten beri Ankara'dır."],
  ["coklu", "", "Aşağıdakilerden hangileri asal sayıdır?", "", "2|4|5|9", "1;3", "2 ve 5 yalnızca 1'e ve kendilerine bölünür."],
  ["suruklebirak", "", "Aşağıdaki hayvanları sınıflarına ayırın.", "", "Kartal => Kuş|Yunus => Memeli|Serçe => Kuş|Balina => Memeli", "", ""],
  ["senaryo", "S1", "Bir e-ticaret sitesi kampanya gününde yüksek trafik alıyor ve sayfalar yavaşlıyor.", "Aşağıdaki soruları bu duruma göre cevaplayın.", "", "", ""],
  ["tek", "S1", "Sorunu teşhis etmek için önce hangi ölçüm yapılmalı?", "", "Sunucu yanıt süresi|Logo rengi|Footer metni", "1", ""],
  ["coklu", "S1", "Hangi önlemler yükü azaltmaya yardımcı olur?", "", "Önbellekleme|Yük dengeleme|Sayfa sayısını artırma", "1;2", ""],
];

/** İndirilecek şablon: UTF-8 BOM'lu (Excel'de Türkçe karakterler bozulmasın), CRLF satır sonlu. */
export function quizCsvTemplate(): string {
  const rows = [[...CSV_COLUMNS], ...TEMPLATE_NOTES.map((n) => [n]), ...TEMPLATE_ROWS];
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

// — Ayrıştırma —

type Rec = { line: number; cells: string[] };

/** Excel (tr) CSV'yi ';' ile kaydeder: ayırıcı, başlık satırından tanınır. */
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() && !/^\s*"?#/.test(l)) ?? "";
  const count = (d: string) => first.split(d).length - 1;
  return [";", "\t"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

/** RFC 4180: tırnaklı alanlar, "" kaçışı, tırnak içinde satır sonu. line = kaydın başladığı satır. */
function parseRecords(text: string, delim: string): { records: Rec[]; unterminated: boolean } {
  const records: Rec[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRec = () => {
    cells.push(cell);
    records.push({ line: start, cells });
    cells = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { cells.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRec();
      line++;
      start = line;
    } else cell += c;
  }
  if (cell !== "" || cells.length) endRec();
  return { records, unterminated: quoted };
}

/** "2", "1;3", "A" gibi doğru-şık yazımı → 0 tabanlı indeksler; hata ise metin. */
function parseCorrect(raw: string, n: number): number[] | string {
  const parts = raw.split(/[;,\s]+/).filter(Boolean);
  if (!parts.length) return "dogru sütunu boş (doğru şıkkın numarasını yazın).";
  const out: number[] = [];
  for (const p of parts) {
    const num = /^\d+$/.test(p) ? Number(p) : /^[a-z]$/i.test(p) ? p.toUpperCase().charCodeAt(0) - 64 : NaN;
    if (!(num >= 1 && num <= n)) return `dogru sütunundaki "${p}" geçerli bir şık numarası değil (1–${n}).`;
    out.push(num - 1);
  }
  return out;
}

const splitList = (raw: string) => raw.split("|").map((s) => s.trim()).filter(Boolean);

type Entry = { row: number; value: Record<string, unknown>; children?: { row: number; value: Record<string, unknown> }[] };

export function parseQuizCsv(input: string): CsvResult {
  const text = input.replace(/^﻿/, "");
  const { records, unterminated } = parseRecords(text, detectDelimiter(text));
  const errors: string[] = [];
  if (unterminated) errors.push('Dosyanın sonunda kapanmamış bir çift tırnak (") var.');

  const rows = records.filter((r) => r.cells.some((c) => c.trim()) && !r.cells[0].trim().startsWith("#"));
  const header = rows.shift();
  if (!header) return { ok: false, errors: [...errors, "CSV boş: başlık satırı bulunamadı."] };

  const col: Record<string, number> = {};
  header.cells.forEach((name, i) => { col[fold(name)] = i; });
  const missing = REQUIRED.filter((name) => !(name in col));
  if (missing.length) return { ok: false, errors: [...errors, `Başlık satırında eksik sütun: ${missing.join(", ")}.`] };

  const entries: Entry[] = [];
  const scenarios = new Map<string, Entry>();

  for (const { line: row, cells } of rows) {
    const get = (name: string) => (cells[col[name]] ?? "").trim();
    const fail = (msg: string) => errors.push(`Satır ${row}: ${msg}`);

    if (cells.slice(header.cells.length).some((c) => c.trim())) {
      fail("beklenenden fazla sütun var (metinde virgül varsa o alanı çift tırnak içine alın).");
      continue;
    }
    const kind = KINDS[fold(get("tip")).replace(/[^a-z]/g, "")];
    if (!kind) {
      fail(`bilinmeyen tip "${get("tip")}" (tek, coklu, suruklebirak veya senaryo olmalı).`);
      continue;
    }
    const code = fold(get("senaryo"));
    const explanation = get("aciklama");

    if (kind === "scenario") {
      if (!code) { fail("senaryo satırında senaryo kodu (S1 gibi) olmalı."); continue; }
      if (scenarios.has(code)) { fail(`"${get("senaryo")}" senaryo kodu daha önce kullanılmış.`); continue; }
      const entry: Entry = { row, value: { kind, scenario_text: get("soru"), scenario_prompt: get("senaryo_sorusu") }, children: [] };
      scenarios.set(code, entry);
      entries.push(entry);
      continue;
    }

    if (kind === "categorize") {
      if (code) { fail("senaryo içinde sürükle-bırak soru olamaz (yalnızca tek/coklu)."); continue; }
      const categories: string[] = [];
      const cards: { card_text: string; category_index: number }[] = [];
      let bad = false;
      for (const item of splitList(get("secenekler"))) {
        const at = item.lastIndexOf("=>");
        const card_text = at < 0 ? "" : item.slice(0, at).trim();
        const category = at < 0 ? "" : item.slice(at + 2).trim();
        if (!card_text || !category) {
          fail(`"${item}" kartı "kart metni => kategori" biçiminde olmalı.`);
          bad = true;
          break;
        }
        let category_index = categories.indexOf(category);
        if (category_index < 0) category_index = categories.push(category) - 1;
        cards.push({ card_text, category_index });
      }
      if (!bad) entries.push({ row, value: { kind, question_text: get("soru"), explanation, categories, cards } });
      continue;
    }

    // tek / coklu
    const texts = splitList(get("secenekler"));
    const correct = parseCorrect(get("dogru"), texts.length);
    if (typeof correct === "string") { fail(correct); continue; }
    const value = { kind, question_text: get("soru"), explanation, options: texts.map((option_text, i) => ({ option_text, is_correct: correct.includes(i) })) };
    if (!code) { entries.push({ row, value }); continue; }
    const parent = scenarios.get(code);
    if (!parent) { fail(`"${get("senaryo")}" kodlu senaryo bulunamadı (senaryo satırı alt sorulardan önce gelmeli).`); continue; }
    parent.children!.push({ row, value });
  }

  const items: EditorItem[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const value = e.children ? { ...e.value, questions: e.children.map((c) => c.value) } : e.value;
    const r = quizItemSchema.safeParse(value);
    if (r.success) { items.push(toEditor(r.data)); continue; }
    for (const issue of r.error.issues) {
      const child = e.children && issue.path[0] === "questions" && typeof issue.path[1] === "number" ? e.children[issue.path[1]] : undefined;
      const msg = `Satır ${child?.row ?? e.row}: ${issue.message}`;
      if (!seen.has(msg)) { seen.add(msg); errors.push(msg); }
    }
  }

  if (!errors.length && !items.length) errors.push("CSV'de soru bulunamadı.");
  if (!errors.length && items.length > MAX_IMPORT_QUESTIONS) errors.push(`Tek seferde en çok ${MAX_IMPORT_QUESTIONS} soru yüklenebilir.`);
  return errors.length ? { ok: false, errors } : { ok: true, items };
}

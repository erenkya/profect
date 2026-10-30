// Soru havuzu: kayıtta doğrulama ve öğrenci için soru çekimi. Saf modül (istemci + sunucu); rastgelelik dışarıdan verilir.

import { orderForStudent, pickItems, type PublicQuestion, type QuizItem } from "./quiz-model.ts";

export type PoolKind = "single" | "multiple" | "categorize";
export type PoolEntry = { id: number; kind: PoolKind; required: boolean };
/** drawCount: sınavda gösterilecek soru sayısı (null = havuzun tamamı); byType: tip kotaları (olmayan anahtar = kota yok). */
export type PoolConfig = { drawCount: number | null; byType: Partial<Record<PoolKind, number>> };

export const POOL_KINDS: PoolKind[] = ["single", "multiple", "categorize"];
export const KIND_LABEL: Record<PoolKind, string> = { single: "tek cevaplı", multiple: "çok cevaplı", categorize: "sürükle-bırak" };

const cap = (s: string) => s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);

/** Havuz ayarlarının tutarlılığı; boş dizi = geçerli. Sözdizimi (pozitif tam sayı vb.) şemada denetlenir. */
export function validatePool(entries: { kind: PoolKind; required: boolean }[], cfg: PoolConfig): string[] {
  const errors: string[] = [];
  const total = entries.length;
  const n = cfg.drawCount ?? total;
  if (cfg.drawCount !== null && cfg.drawCount > total) errors.push(`Sınavda ${n} soru istendi ama havuzda ${total} soru var.`);
  const requiredTotal = entries.filter((e) => e.required).length;
  if (requiredTotal > n) errors.push(`Kesin işaretli ${requiredTotal} soru var ama sınavda yalnızca ${n} soru gösterilecek.`);

  let reserved = 0; // kotalı tipte kota, kotasız tipte kesin soru sayısı
  for (const kind of POOL_KINDS) {
    const ofKind = entries.filter((e) => e.kind === kind);
    const required = ofKind.filter((e) => e.required).length;
    const quota = cfg.byType[kind];
    if (quota === undefined) {
      reserved += required;
      continue;
    }
    if (required > quota) errors.push(`Kesin işaretli ${required} soru var ama ${KIND_LABEL[kind]} kotası ${quota}.`);
    if (quota > ofKind.length) errors.push(`${cap(KIND_LABEL[kind])} kotası ${quota} ama havuzda ${ofKind.length} ${KIND_LABEL[kind]} soru var.`);
    reserved += quota;
  }
  if (reserved > n) errors.push(`Tip kotaları ve kesin sorular en az ${reserved} soru gerektiriyor ama sınavda ${n} soru gösterilecek.`);
  return errors;
}

/**
 * Öğrenci için havuzdan çekilen soru id'leri: kesinler → kotalı tiplerde kota kadarı (kesinler sayılır) →
 * kalan yerler tipten bağımsız. Havuz yetmezse eldekini döndürür, hata fırlatmaz.
 */
export function drawIds(entries: PoolEntry[], cfg: PoolConfig, shuffle: <T>(a: T[]) => T[]): number[] {
  if (cfg.drawCount === null) return entries.map((e) => e.id);
  const n = Math.min(cfg.drawCount, entries.length);
  const chosen = new Set<number>(entries.filter((e) => e.required).slice(0, n).map((e) => e.id));
  const fill = (candidates: PoolEntry[], count: number) => {
    for (const e of shuffle(candidates.filter((c) => !chosen.has(c.id))).slice(0, Math.max(0, Math.min(count, n - chosen.size)))) chosen.add(e.id);
  };
  for (const kind of POOL_KINDS) {
    const quota = cfg.byType[kind];
    if (quota === undefined) continue;
    const ofKind = entries.filter((e) => e.kind === kind);
    fill(ofKind, quota - ofKind.filter((e) => chosen.has(e.id)).length);
  }
  fill(entries, n - chosen.size);
  return [...chosen];
}

/** quizzes.draw_by_type: MySQL nesne, MariaDB metin döndürür. Geçersiz anahtar ve pozitif tam sayı olmayan değerler atılır. */
export function parseByType(raw: unknown): Partial<Record<PoolKind, number>> {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Partial<Record<PoolKind, number>> = {};
  for (const kind of POOL_KINDS) {
    const v = (raw as Record<string, unknown>)[kind];
    if (typeof v === "number" && Number.isInteger(v) && v >= 1) out[kind] = v;
  }
  return out;
}

/** Sınavın modu ve havuz ayarları (quizzes satırından). */
export type QuizSetup = { mode: "fixed" | "pool" } & PoolConfig;

/**
 * Öğrenciye gidecek sorular. Sabit: editör sırası, karıştırma yok. Havuz: çekim → seçilenler →
 * üst düzey öğeler karışık (aynı senaryonun soruları bitişik). Şık/kart karıştırma çağıranın işi.
 */
export function selectForStudent(items: QuizItem[], required: ReadonlySet<number>, setup: QuizSetup, shuffle: <T>(a: T[]) => T[]): PublicQuestion[] {
  const all = items.flatMap((it) => (it.kind === "question" ? [it.question] : it.questions));
  if (setup.mode === "fixed") return all;
  const ids = new Set(drawIds(all.map((q) => ({ id: q.id, kind: q.kind, required: required.has(q.id) })), setup, shuffle));
  return orderForStudent(pickItems(items, ids), shuffle);
}

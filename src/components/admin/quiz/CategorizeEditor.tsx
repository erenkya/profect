"use client";

import { Trash2 } from "lucide-react";
import { ExplanationField, input, type CatQ } from "./ChoiceEditor";

const MAX_CATEGORIES = 8;
const MAX_CARDS = 30;

export const blankCategorize = (): CatQ => ({
  kind: "categorize",
  question_text: "",
  explanation: "",
  categories: ["", ""],
  cards: [{ card_text: "", category_index: 0 }, { card_text: "", category_index: 1 }],
});

/** Sürükle-bırak sorusu: kategoriler ve her kartın doğru kategorisi. */
export function CategorizeEditor({ idPrefix, value: q, onChange }: { idPrefix: string; value: CatQ; onChange: (q: CatQ) => void }) {
  const removeCategory = (i: number) =>
    onChange({
      ...q,
      categories: q.categories.filter((_, k) => k !== i),
      // Silinen kategorideki kartlar kategorisiz (-1) kalır; sonrakilerin indeksi kayar.
      cards: q.cards.map((c) => ({ ...c, category_index: c.category_index === i ? -1 : c.category_index > i ? c.category_index - 1 : c.category_index })),
    });

  const emptyCategories = q.categories.map((name, i) => ({ name, i })).filter(({ i }) => !q.cards.some((c) => c.category_index === i && c.card_text.trim()));
  const uncategorized = q.cards.filter((c) => c.card_text.trim() && c.category_index < 0).length;

  return (
    <>
      <textarea className="input" rows={2} placeholder="Soru metni (ör. Aşağıdaki kavramları doğru gruba ayırın)" value={q.question_text} onChange={(e) => onChange({ ...q, question_text: e.target.value })} style={{ background: "#fff", fontSize: 15 }} />

      <div className="field">
        <label>Kategoriler</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.categories.map((name, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input className="input" placeholder={`Kategori ${i + 1}`} value={name} onChange={(e) => onChange({ ...q, categories: q.categories.map((n, k) => (k === i ? e.target.value : n)) })} style={{ ...input, flex: 1 }} />
              {q.categories.length > 2 && (
                <button type="button" className="btn btn-icon btn-secondary" aria-label={`Kategori ${i + 1}'i sil`} style={{ width: 32, height: 32 }} onClick={() => removeCategory(i)}>
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
        </div>
        {q.categories.length < MAX_CATEGORIES && (
          <button type="button" className="btn btn-ghost" style={{ padding: "4px 0", fontSize: 14, alignSelf: "flex-start" }} onClick={() => onChange({ ...q, categories: [...q.categories, ""] })}>
            + Kategori ekle
          </button>
        )}
      </div>

      <div className="field">
        <label>Kartlar ve doğru kategorileri</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.cards.map((c, j) => (
            <div key={j} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input className="input" placeholder={`Kart ${j + 1}`} value={c.card_text} onChange={(e) => onChange({ ...q, cards: q.cards.map((x, k) => (k === j ? { ...x, card_text: e.target.value } : x)) })} style={{ ...input, flex: "1 1 220px" }} />
              <select
                className="input"
                aria-label={`Kart ${j + 1} kategorisi`}
                value={c.category_index}
                onChange={(e) => onChange({ ...q, cards: q.cards.map((x, k) => (k === j ? { ...x, category_index: Number(e.target.value) } : x)) })}
                style={{ ...input, flex: "0 1 200px" }}
              >
                <option value={-1}>Kategori seçin…</option>
                {q.categories.map((name, i) => (
                  <option key={i} value={i}>{name.trim() || `Kategori ${i + 1}`}</option>
                ))}
              </select>
              {q.cards.length > 2 && (
                <button type="button" className="btn btn-icon btn-secondary" aria-label={`Kart ${j + 1}'i sil`} style={{ width: 32, height: 32 }} onClick={() => onChange({ ...q, cards: q.cards.filter((_, k) => k !== j) })}>
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
        </div>
        {q.cards.length < MAX_CARDS && (
          <button type="button" className="btn btn-ghost" style={{ padding: "4px 0", fontSize: 14, alignSelf: "flex-start" }} onClick={() => onChange({ ...q, cards: [...q.cards, { card_text: "", category_index: -1 }] })}>
            + Kart ekle
          </button>
        )}
      </div>

      {(emptyCategories.length > 0 || uncategorized > 0) && (
        <div role="status" style={{ fontSize: 13, color: "var(--color-accent-2)" }}>
          {emptyCategories.length > 0 && <div>Her kategoride en az bir kart olmalı: {emptyCategories.map(({ name, i }) => name.trim() || `Kategori ${i + 1}`).join(", ")} boş.</div>}
          {uncategorized > 0 && <div>{uncategorized} kartın kategorisi seçilmedi.</div>}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--muted-55)" }}>Kısmi puan: öğrenci doğru kategoriye koyduğu kart oranında puan alır. Boş kartlar kaydedilmez.</div>

      <ExplanationField id={`${idPrefix}-explanation`} value={q.explanation} onChange={(explanation) => onChange({ ...q, explanation })} />
    </>
  );
}

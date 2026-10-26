"use client";

import { useState } from "react";

const OTHER = "__other__";

type Props = { id: string; categories: string[]; value: string; onChange: (v: string) => void; style: React.CSSProperties };

/** Mevcut kategorileri açılır listede gösterir; "Diğer" ile yenisi yazılabilir. */
export function CategoryField({ id, categories, value, onChange, style }: Props) {
  const [other, setOther] = useState(false);

  // Yazılan değer mevcut bir kategorinin yazımıyla (büyük/küçük harf farkıyla) aynıysa listedekine bağla.
  function settle() {
    const match = categories.find((c) => c.toLocaleLowerCase("tr-TR") === value.trim().toLocaleLowerCase("tr-TR"));
    if (match) { onChange(match); setOther(false); }
  }

  return (
    <>
      <select
        id={id}
        className="input"
        value={other ? OTHER : value}
        onChange={(e) => {
          const v = e.target.value;
          setOther(v === OTHER);
          onChange(v === OTHER ? "" : v);
        }}
        style={style}
      >
        <option value="">Kategori seçin</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value={OTHER}>Diğer…</option>
      </select>
      {other && (
        <input
          className="input"
          aria-label="Yeni kategori"
          placeholder="Yeni kategori adı"
          autoFocus
          maxLength={80}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={settle}
          style={{ ...style, marginTop: 8 }}
        />
      )}
    </>
  );
}

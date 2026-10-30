"use client";

import { KIND_LABEL, POOL_KINDS, type PoolKind } from "@/lib/quiz-pool";

type Props = {
  mode: "fixed" | "pool";
  onMode: (m: "fixed" | "pool") => void;
  drawCount: string;
  onDrawCount: (v: string) => void;
  byType: Record<PoolKind, string>;
  onByType: (kind: PoolKind, v: string) => void;
  poolCounts: Record<PoolKind, number>;
  total: number;
  remaining: number | null;
  problems: string[];
};

const MODES = [
  { value: "fixed", title: "Sabit sınav", hint: "Sorular yazdığınız sırayla, her öğrenciye aynı." },
  { value: "pool", title: "Soru havuzu", hint: "Her öğrenciye havuzdan farklı, rastgele bir set çıkar." },
] as const;

const cap = (s: string) => s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);

/** Sınav türü (sabit / havuz) ve havuz ayarları: soru sayısı, tipe göre dağılım. Kesin işareti her sorunun kartındadır. */
export function PoolSettings({ mode, onMode, drawCount, onDrawCount, byType, onByType, poolCounts, total, remaining, problems }: Props) {
  const input = { background: "#fff", fontSize: 15, minHeight: 38 } as const;
  return (
    <fieldset style={{ border: "1px solid var(--muted-20, #ddd)", padding: 16, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <legend style={{ fontSize: 13, padding: "0 6px", color: "var(--muted-72)" }}>Sınav türü</legend>
      <div role="radiogroup" aria-label="Sınav türü" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {MODES.map((m) => (
          <label key={m.value} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="radio" name="quiz-mode" checked={mode === m.value} onChange={() => onMode(m.value)} style={{ marginTop: 4 }} />
            <span>
              <strong>{m.title}</strong>
              <span style={{ display: "block", fontSize: 13, color: "var(--muted-55)" }}>{m.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "pool" && (
        <>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="pool-draw-count">Sınavda gösterilecek soru sayısı</label>
            <input id="pool-draw-count" className="input" type="number" min={1} placeholder={`Hepsi (${total})`} value={drawCount} onChange={(e) => onDrawCount(e.target.value)} style={input} />
          </div>

          <div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              Tipe göre dağılım <span style={{ color: "var(--muted-55)" }}>(isteğe bağlı · boş bırakılan tipe kota konmaz)</span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {POOL_KINDS.map((kind) => (
                <div key={kind} className="field" style={{ width: 150 }}>
                  <label htmlFor={`pool-quota-${kind}`}>{cap(KIND_LABEL[kind])}</label>
                  <input id={`pool-quota-${kind}`} className="input" type="number" min={1} value={byType[kind]} onChange={(e) => onByType(kind, e.target.value)} style={input} />
                  <span style={{ fontSize: 12, color: "var(--muted-55)" }}>havuzda {poolCounts[kind]}</span>
                </div>
              ))}
            </div>
          </div>

          {remaining !== null && remaining > 0 && <div style={{ fontSize: 13, color: "var(--muted-72)" }}>Kalan {remaining} soru tipten bağımsız, rastgele seçilir.</div>}
          {problems.length > 0 && (
            <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--color-accent-2)" }}>
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </>
      )}
    </fieldset>
  );
}

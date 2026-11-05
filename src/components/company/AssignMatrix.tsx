"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { adminApi } from "@/components/admin/api";
import { cellKey, cellState, columnRemaining } from "@/lib/assign-matrix";
import type { AssignMatrixData, MatrixColumn } from "@/lib/company-matrix";

type Failure = { userName: string; title: string; message: string };
type Props = {
  base: string;
  members: { userId: number; name: string }[];
  matrix: AssignMatrixData;
  /** Sütun başlığındaki "Daha fazla al" bağlantısı; satın alınamayan sütun için null. */
  buyHref?: (col: MatrixColumn) => string | null;
  onDone: (r: { assigned: number; failed: Failure[] }) => void;
};

const stickyCell = { position: "sticky", left: 0, zIndex: 1, background: "#fff", minWidth: 150, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", boxShadow: "1px 0 0 var(--color-divider)" } as const;
const checkbox = { width: 20, height: 20, cursor: "pointer" } as const;

/**
 * Toplu atama matrisi: satırlar onaylı üyeler, sütunlar kontenjanı olan kurslar ve programlar. İşaretlenen kutucuklar tek istekte
 * `POST <base>/assignments/bulk` ile atanır. Canlı "Kalan" ve kapalı kutucuklar yalnızca kolaylıktır; kontenjan, üyelik ve sahiplik sunucuda yeniden denetlenir.
 */
export function AssignMatrix({ base, members, matrix, buyHref, onDone }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const pendingIn = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of checked) { const col = k.slice(k.indexOf(":") + 1); m.set(col, (m.get(col) ?? 0) + 1); }
    return m;
  }, [checked]);

  const courseCols = matrix.columns.filter((c) => c.kind === "course");
  const programCols = matrix.columns.filter((c) => c.kind === "program");

  if (members.length === 0) return <p style={{ color: "var(--muted-72)" }}>Atama yapabilmek için önce onaylı bir çalışanınız olmalı.</p>;
  if (matrix.columns.length === 0) return <p style={{ color: "var(--muted-72)" }}>Atanabilecek kontenjan yok. Yukarıdan bir eğitim ya da program için kontenjan satın alın.</p>;

  const toggle = (key: string) => setChecked((s) => { const n = new Set(s); if (!n.delete(key)) n.add(key); return n; });

  async function apply() {
    const items = [...checked].map((k) => {
      const [u, kind, id] = k.split(":");
      return kind === "p" ? { user_id: Number(u), program_id: Number(id) } : { user_id: Number(u), course_id: Number(id) };
    });
    if (items.length === 0) return;
    setBusy(true);
    try {
      const r = await adminApi("POST", `${base}/assignments/bulk`, { items, due_at: due || null });
      if (!r.ok) return onDone({ assigned: 0, failed: [{ userName: "", title: "", message: r.message }] });
      const nameOf = new Map(members.map((m) => [m.userId, m.name]));
      const titleOf = new Map(matrix.columns.map((c) => [c.key, c.title]));
      const failed = ((r.json.failed as { user_id: number; course_id?: number; program_id?: number; message: string }[] | undefined) ?? []).map((f) => ({
        userName: nameOf.get(f.user_id) ?? "Çalışan",
        title: titleOf.get(f.program_id !== undefined ? `p:${f.program_id}` : `c:${f.course_id}`) ?? "Eğitim",
        message: f.message,
      }));
      setChecked(new Set()); // başarılılar "atandı" olur, başarısızlar listede; hiçbiri işaretli kalmaz
      onDone({ assigned: Number(r.json.assigned ?? 0), failed });
    } finally {
      setBusy(false);
    }
  }

  const n = checked.size;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="admin-table-wrap">
        <table className="table" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th style={stickyCell} rowSpan={2} scope="col">Çalışan</th>
              {courseCols.length > 0 && <th colSpan={courseCols.length} scope="colgroup" style={{ textAlign: "center" }}>Eğitimler</th>}
              {programCols.length > 0 && <th colSpan={programCols.length} scope="colgroup" style={{ textAlign: "center", borderLeft: courseCols.length ? "1px solid var(--color-divider)" : undefined }}>Programlar</th>}
            </tr>
            <tr>
              {matrix.columns.map((c, i) => {
                const href = buyHref?.(c) ?? null;
                return (
                  <th key={c.key} scope="col" style={{ textAlign: "center", whiteSpace: "normal", minWidth: 120, verticalAlign: "bottom", borderLeft: c.kind === "program" && i === courseCols.length ? "1px solid var(--color-divider)" : undefined }}>
                    <div style={{ fontWeight: 700 }}>{c.title}</div>
                    {href && <Link href={href} style={{ fontSize: 12, fontWeight: 400 }}>Daha fazla al</Link>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <th scope="row" style={{ ...stickyCell, fontWeight: 600, textAlign: "left" }} title={m.name}>{m.name}</th>
                {matrix.columns.map((c) => {
                  const key = cellKey(m.userId, c.key);
                  const state = cellState({ server: matrix.cells[key], checked: checked.has(key), free: c.free, pendingInColumn: pendingIn.get(c.key) ?? 0 });
                  const label = `${m.name}: ${c.title}`;
                  return (
                    <td key={c.key} style={{ textAlign: "center", fontSize: 13 }}>
                      {state === "assigned" ? <span className="tag tag-accent">✔ atandı</span>
                        : state === "burned" ? <span className="tag tag-accent-2">yandı</span>
                        : state === "owned" ? <span className="tag tag-neutral">zaten sahip</span>
                        : <input type="checkbox" style={checkbox} aria-label={label} checked={state === "checked"} disabled={state === "full"} onChange={() => toggle(key)} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" style={{ ...stickyCell, textAlign: "left" }}>Kalan</th>
              {matrix.columns.map((c) => {
                const left = columnRemaining(c.free, pendingIn.get(c.key) ?? 0);
                return <td key={c.key} style={{ textAlign: "center", fontWeight: 700 }} aria-live="polite" aria-label={`${c.title} kalan kontenjan`}>{left}</td>;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label htmlFor="matrix-due">Son tarih (isteğe bağlı)</label>
          <input id="matrix-due" className="input" type="datetime-local" step={60} value={due} onChange={(e) => setDue(e.target.value)} aria-describedby="matrix-due-hint" style={{ background: "#fff", minHeight: 36 }} />
        </div>
        <button type="button" className="btn btn-primary" disabled={n === 0 || busy} onClick={apply}>
          {busy ? "Atanıyor…" : `${n} atamayı uygula`}
        </button>
      </div>
      <div id="matrix-due-hint" style={{ fontSize: 13, color: "var(--muted-55)", marginTop: -4 }}>Türkiye saatiyle girilir ve yalnızca işaretlediğiniz <strong>eğitim</strong> atamalarına uygulanır; programlarda son tarih yoktur.</div>
    </div>
  );
}

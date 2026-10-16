// HTTP `Range: bytes=…` ayrıştırma. Tek aralık desteklenir; yanıt en çok `maxChunk` bayta kısaltılır.
export type ByteRange = { start: number; end: number }; // ikisi de dahil

export function parseByteRange(header: string | null, size: number, maxChunk: number): ByteRange | "unsatisfiable" {
  if (!(size > 0)) return "unsatisfiable";
  if (header === null) return { start: 0, end: Math.min(maxChunk, size) - 1 };

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "unsatisfiable";

  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n) || n === 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Number(m[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return "unsatisfiable";
  }
  return { start, end: Math.min(end, start + maxChunk - 1, size - 1) };
}

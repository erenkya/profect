import { Download } from "lucide-react";
import { fileExtension, formatFileSize } from "@/lib/lesson-file";
import type { LessonFileItem } from "@/lib/lesson-files";

/** Dersin indirilebilir dosyaları. Yalnızca kayıtlı öğrenci/yönetici için render edilir; bağlantı sunucuda yetki kontrolünden geçer. */
export function LessonFiles({ lessonId, files }: { lessonId: number; files: LessonFileItem[] }) {
  if (files.length === 0) return null;
  return (
    <section aria-labelledby="lesson-files-title" style={{ marginTop: 40, maxWidth: 760 }}>
      <h2 id="lesson-files-title" style={{ fontSize: 28, textTransform: "uppercase", margin: "0 0 16px" }}>Ders dosyaları</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {files.map((f) => {
          const ext = fileExtension(f.file_name);
          return (
            <li key={f.id}>
              <a
                href={`/api/client/lessons/${lessonId}/files/${f.id}`}
                className="card"
                style={{ background: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, textDecoration: "none", color: "inherit" }}
              >
                <Download size={18} strokeWidth={1.5} aria-hidden />
                <span style={{ flex: 1, fontSize: 16 }}>{f.title}</span>
                <span style={{ fontSize: 13, color: "var(--muted-55)" }}>{ext ? `${ext.toUpperCase()} · ` : ""}{formatFileSize(f.size_bytes)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import Link from "next/link";
import { Layers } from "lucide-react";

/** "Bu kurs X programının parçası" — kursu içeren yayındaki programlara küçük bağlantı; program yoksa hiçbir şey çizmez. */
export function CourseInPrograms({ programs }: { programs: { slug: string; title: string }[] }) {
  if (programs.length === 0) return null;
  const link = (p: { slug: string; title: string }) => <Link key={p.slug} href={`/programlar/${p.slug}`}>{p.title}</Link>;
  return (
    <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14, color: "var(--muted-72)", margin: "0 0 20px" }}>
      <Layers size={16} strokeWidth={1.5} aria-hidden style={{ flex: "none" }} />
      {programs.length === 1 ? (
        <span>Bu kurs {link(programs[0])} programının parçası</span>
      ) : (
        <span>Bu kurs şu programların parçası: {programs.map((p, i) => <span key={p.slug}>{i > 0 && ", "}{link(p)}</span>)}</span>
      )}
    </p>
  );
}

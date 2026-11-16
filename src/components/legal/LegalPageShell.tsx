import Link from "next/link";

export function LegalPageShell({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(56px,8vw,112px)", maxWidth: 820 }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>Yasal</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,64px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 12px" }}>{title}</h1>
      <p style={{ color: "var(--muted-72)", margin: "0 0 40px" }}>{lead}</p>
      {children}
      <p style={{ marginTop: 48 }}><Link href="/">← Ana sayfaya dön</Link></p>
    </main>
  );
}

export function PageTitle({ title, hint }: { title: string; hint?: React.ReactNode }) {
  return (
    <header style={{ marginBottom: 32 }}>
      <h1 style={{ fontSize: "clamp(40px,5vw,64px)", lineHeight: 0.95, textTransform: "uppercase", margin: "0 0 8px" }}>{title}</h1>
      {hint && <p style={{ color: "var(--muted-72)", margin: 0 }}>{hint}</p>}
    </header>
  );
}

import { Corners } from "@/components/Corners";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "calc(100vh - 140px)", display: "grid", placeItems: "center", padding: "clamp(40px,8vw,96px) 20px" }}>
      <div className="card blueprint elev-md" style={{ width: "min(460px,100%)", background: "#ffffff", padding: "clamp(24px,5vw,40px)", gap: 18 }}>
        <Corners />
        <div>
          <h1 style={{ fontSize: 40, textTransform: "uppercase", margin: "0 0 6px" }}>{title}</h1>
          {subtitle && <p style={{ margin: 0, fontSize: 15, color: "var(--muted-72)" }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      style={{
        fontSize: 14,
        padding: "10px 12px",
        border: `1px solid ${kind === "error" ? "var(--color-accent-2-300)" : "var(--color-accent-300)"}`,
        background: kind === "error" ? "var(--color-accent-2-100)" : "var(--color-accent-100)",
        color: kind === "error" ? "var(--color-accent-2-800)" : "var(--color-accent-800)",
      }}
    >
      {children}
    </div>
  );
}

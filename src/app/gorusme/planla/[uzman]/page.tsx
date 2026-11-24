import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EXPERTS, isExpertId } from "@/data/experts";
import { getCurrentUser } from "@/lib/auth";
import { listAvailableDays } from "@/lib/meetings";
import { turnstileSiteKey } from "@/lib/turnstile";
import { MeetingBooking } from "@/components/meetings/MeetingBooking";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ uzman: string }> }): Promise<Metadata> {
  const { uzman } = await params;
  return { title: isExpertId(uzman) ? `${EXPERTS[uzman].name} ile görüşme planla` : "Görüşme planla" };
}

export default async function PlanMeetingPage({ params }: { params: Promise<{ uzman: string }> }) {
  const { uzman } = await params;
  if (!isExpertId(uzman)) notFound();
  const x = EXPERTS[uzman];
  let available = false;
  try {
    available = (await listAvailableDays(uzman, 15)).length > 0;
  } catch (err) {
    console.error("[PlanMeetingPage] müsaitlik okunamadı", err);
  }
  const user = await getCurrentUser();
  return (
    <main className="wrap section-pad" style={{ maxWidth: 960 }}>
      <Link href="/#uzman-gorusme" className="btn btn-ghost" style={{ marginBottom: 16 }}>← Tüm uzmanlar</Link>
      <header className="meet-head" data-tone={uzman === "kaan" ? "purple" : "blue"}>
        <span className="meet-head-photo"><span className="meet-glow" aria-hidden /><Image src={x.photo} alt={x.name} fill sizes="200px" priority /></span>
        <div>
          <div className="eyebrow">Görüşme planla</div>
          <h1 className="h-section" style={{ margin: "0 0 6px" }}>{x.name}</h1>
          <div style={{ color: "var(--muted-72)", marginBottom: 10 }}>{x.role}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{x.topics.map((t) => <span key={t} className="meet-topic" style={{ opacity: 1, transform: "none" }}>{t}</span>)}</div>
        </div>
      </header>
      {available ? (
        <MeetingBooking
          expert={{ id: uzman, name: x.name, role: x.role, photo: x.photo, topics: x.topics, available }}
          siteKey={turnstileSiteKey()}
          prefill={user ? { name: user.full_name ?? "", email: user.email ?? "" } : null}
        />
      ) : (
        <div className="meet-panel"><p style={{ margin: 0 }}>Bu uzmanın takvimi henüz açılmadı. Lütfen daha sonra tekrar bakın.</p></div>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MeetingSummary } from "@/components/meetings/MeetingSummary";
import { VisitorResponse } from "@/components/meetings/VisitorResponse";
import { getMeetingByToken } from "@/lib/meetings";

export const metadata: Metadata = { title: "Görüşme talebiniz", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VisitorMeetingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getMeetingByToken(token);
  if (!found || found.role !== "visitor") notFound();
  const m = found.meeting;
  return (
    <main className="wrap section-pad" style={{ maxWidth: 720 }}>
      <div className="eyebrow">Görüşme talebiniz</div>
      <h1 className="h-section" style={{ marginBottom: 24 }}>Görüşme durumu</h1>
      <MeetingSummary m={m} />
      <VisitorResponse token={token} status={m.status} />
    </main>
  );
}

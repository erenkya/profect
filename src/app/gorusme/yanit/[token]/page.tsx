import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpertResponse } from "@/components/meetings/ExpertResponse";
import { MeetingSummary } from "@/components/meetings/MeetingSummary";
import { getMeetingByToken } from "@/lib/meetings";

export const metadata: Metadata = { title: "Görüşme talebi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ExpertMeetingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getMeetingByToken(token);
  if (!found || found.role !== "expert") notFound();
  const m = found.meeting;
  return (
    <main className="wrap section-pad" style={{ maxWidth: 720 }}>
      <div className="eyebrow">Görüşme talebi</div>
      <h1 className="h-section" style={{ marginBottom: 24 }}>{m.fullName} ile görüşme</h1>
      <MeetingSummary m={m} showVisitor />
      <ExpertResponse token={token} meeting={{ status: m.status, expert: m.expert, durationMin: m.durationMin, meetingUrl: m.meetingUrl }} />
    </main>
  );
}

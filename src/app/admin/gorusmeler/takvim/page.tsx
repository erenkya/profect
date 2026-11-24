import Link from "next/link";
import { AvailabilityCalendar } from "@/components/admin/AvailabilityCalendar";
import { listMeetings, listRules } from "@/lib/meetings";

export const metadata = { title: "Müsaitlik takvimi" };
export const dynamic = "force-dynamic";

export default async function AdminAvailability() {
  const [rules, all] = await Promise.all([listRules(), listMeetings()]);
  const meetings = all.filter((m) => m.status !== "declined" && m.status !== "cancelled").map((m) => ({ id: m.id, expert: m.expert, startsAt: m.startsAt, endsAt: m.endsAt, status: m.status, fullName: m.fullName }));
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
        <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: 0 }}>Müsaitlik takvimi</h1>
        <Link href="/admin/gorusmeler" className="btn btn-secondary">Görüşmeler</Link>
      </div>
      <p style={{ color: "var(--muted-72)", marginBottom: 24 }}>Müsait olduğunuz ve olmadığınız zamanları tek seferlik ya da günlük/haftalık/aylık tekrarla girin. Ziyaretçiler yalnızca müsait kurallardan “müsait değil” kuralları ve onaylı toplantılar çıkarılınca kalan saatleri görür.</p>
      <AvailabilityCalendar rules={rules} meetings={meetings} />
    </>
  );
}

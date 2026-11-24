import Link from "next/link";
import { MeetingsTable } from "@/components/admin/MeetingsTable";
import { listMeetings } from "@/lib/meetings";

export const metadata = { title: "Görüşmeler" };
export const dynamic = "force-dynamic";

export default async function AdminMeetings() {
  const meetings = await listMeetings();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
        <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: 0 }}>Görüşmeler</h1>
        <Link href="/admin/gorusmeler/takvim" className="btn btn-secondary">Müsaitlik takvimi</Link>
      </div>
      <p style={{ color: "var(--muted-72)", marginBottom: 24 }}>Kaan Tunçbilek ve Tuğrul Günal için gelen görüşme talepleri. Saat, tarih ya da bağlantı değiştiğinde ziyaretçiye otomatik mail gider.</p>
      <MeetingsTable meetings={meetings} />
    </>
  );
}

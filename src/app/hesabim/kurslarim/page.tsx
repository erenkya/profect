import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyCourseCard } from "@/components/account/MyCourseCard";
import { PageTitle } from "@/components/account/PageTitle";
import { getCurrentUser } from "@/lib/auth";
import { listMyCourses } from "@/lib/lms";

export const metadata: Metadata = { title: "Eğitimlerim" };

export default async function MyCoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/kurslarim");
  const courses = await listMyCourses(user.id);
  return (
    <>
      <PageTitle title="Eğitimlerim" />
      {courses.length === 0 ? (
        <p style={{ color: "var(--muted-72)" }}>Henüz bir eğitimin yok. <Link href="/kurslar">Eğitimleri keşfet →</Link></p>
      ) : (
        <div className="course-grid acc-grid">
          {courses.map((c, i) => (
            <div key={c.id} data-reveal data-delay={Math.min(i, 5) * 70}><MyCourseCard c={c} /></div>
          ))}
        </div>
      )}
    </>
  );
}

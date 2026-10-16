import { notFound } from "next/navigation";
import { CourseBuilder } from "@/components/admin/CourseBuilder";
import { parseId } from "@/lib/http";
import { getCourseAdminTree } from "@/lib/lms";

export const metadata = { title: "Kurs düzenle" };

export default async function EditCourse({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const tree = await getCourseAdminTree(id);
  if (!tree) notFound();
  return <CourseBuilder course={tree.course} modules={tree.modules} finalQuiz={tree.finalQuiz} />;
}

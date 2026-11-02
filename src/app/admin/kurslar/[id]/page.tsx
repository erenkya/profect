import { notFound } from "next/navigation";
import { CourseBuilder } from "@/components/admin/CourseBuilder";
import { listInstructors } from "@/lib/comments";
import { parseId } from "@/lib/http";
import { getCourseAdminTree, listCategories } from "@/lib/lms";

export const metadata = { title: "Kurs düzenle" };

export default async function EditCourse({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const [tree, categories, instructors] = await Promise.all([getCourseAdminTree(id), listCategories(), listInstructors()]);
  if (!tree) notFound();
  return <CourseBuilder course={tree.course} modules={tree.modules} finalQuiz={tree.finalQuiz} categories={categories} instructors={instructors} />;
}

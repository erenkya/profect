import { notFound } from "next/navigation";
import { ProgramBuilder } from "@/components/admin/ProgramBuilder";
import { parseId } from "@/lib/http";
import { listCategories } from "@/lib/lms";
import { getProgramById, listProgramCourses, listPublishedCourseOptions } from "@/lib/programs";

export const metadata = { title: "Program düzenle" };

export default async function EditProgram({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const [program, courses, options, categories] = await Promise.all([getProgramById(id), listProgramCourses(id), listPublishedCourseOptions(), listCategories()]);
  if (!program) notFound();
  return <ProgramBuilder program={program} courses={courses} options={options} categories={categories} />;
}

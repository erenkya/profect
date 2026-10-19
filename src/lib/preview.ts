/** Satın almadan incelenebilen ders sayısı (müfredat sırasındaki ilk N ders). */
export const FREE_PREVIEW_LESSONS = 2;

/** Müfredat sırasına (modül → ders) göre ücretsiz önizleme derslerinin kimlikleri. */
export function previewLessonIds(tree: { modules: { lessons: { id: number }[] }[] }): number[] {
  return tree.modules.flatMap((m) => m.lessons.map((l) => l.id)).slice(0, FREE_PREVIEW_LESSONS);
}

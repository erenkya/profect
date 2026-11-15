/** Ücretsiz önizleme olarak işaretlenmiş (yönetim panelinden ders bazında seçilir) derslerin kimlikleri; müfredat sırasında. */
export function previewLessonIds(tree: { modules: { lessons: { id: number; is_free_preview: boolean }[] }[] }): number[] {
  return tree.modules.flatMap((m) => m.lessons.filter((l) => l.is_free_preview).map((l) => l.id));
}

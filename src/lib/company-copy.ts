// Şirket panelindeki sabit metinler (destek adresi, başlanmış eğitim uyarısı). `server-only` içermez; testle ve istemciyle paylaşılır.

export const SUPPORT_EMAIL = "info@profect.com.tr";
export const RECLAIM_TITLE = "Bu eğitim geri alınamaz, yalnızca silinebilir";
export const RECLAIM_CONFIRM_LABEL = "Yine de sil";

/** Başlanmış eğitimin geri alınması/çalışanın çıkarılması uyarısının gövdesi. `titles` birden çoksa virgülle listelenir. */
export function startedReclaimText(i: { name: string; titles: readonly string[] }): string {
  return `${i.name} bu eğitime başlamış: ${i.titles.join(", ")}. Başlanmış bir eğitim geri alınamaz, yalnızca silinebilir. Silerseniz çalışanın erişimi kapanır ve bu eğitimin hakkı kaybolur; başka bir kişiye verilemez. Destek için ${SUPPORT_EMAIL} adresine e-posta gönderebilirsiniz.`;
}

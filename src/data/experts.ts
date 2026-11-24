export type ExpertId = "kaan" | "tugrul";

export const EXPERTS: Record<ExpertId, { id: ExpertId; name: string; role: string; photo: string; email: string; topics: string[] }> = {
  tugrul: {
    id: "tugrul",
    name: "Tuğrul Günal",
    role: "Kurucu Ortak",
    photo: "/images/tugrul-portre.png",
    email: "tugrul@tugrulgunaldanismanlik.com",
    topics: ["Tedarik zinciri yönetimi", "Liderlik", "Eğitim ve gelişim"],
  },
  kaan: {
    id: "kaan",
    name: "Kaan Tunçbilek",
    role: "Kurucu Ortak",
    photo: "/images/kaan-portre.png",
    email: "kaan.tuncbilek@xellence.com.tr",
    topics: ["Yapay zekâ", "Teknoloji", "Satış ve pazarlama"],
  },
};
export const EXPERT_IDS = Object.keys(EXPERTS) as ExpertId[];
export const isExpertId = (v: unknown): v is ExpertId => v === "kaan" || v === "tugrul";

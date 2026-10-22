import { z } from "zod";
import { passwordProblem } from "@/lib/password-strength";

// Uzunluk (bcrypt 72 bayt sınırı dahil), karakter türü, yaygın şifre ve asgari güç puanı kuralları
// src/lib/password-strength.ts içindedir; istemci güç göstergesiyle aynı kaynaktan beslenir.
export const passwordSchema = z.string().superRefine((p, ctx) => {
  const problem = passwordProblem(p);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

export const emailSchema = z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").max(190);

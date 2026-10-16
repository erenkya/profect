import { z } from "zod";

// bcrypt yalnızca ilk 72 bayta bakar; daha uzununu reddederek sessiz kırpmayı önleriz.
export const passwordSchema = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalıdır.")
  .refine((p) => new TextEncoder().encode(p).length <= 72, "Şifre çok uzun (en fazla 72 bayt).");

export const emailSchema = z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").max(190);

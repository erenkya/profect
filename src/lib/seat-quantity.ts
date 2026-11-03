// Kontenjan adedi kuralı: istemci (CheckoutForm) ve sunucu (company-rules) aynı şemayı kullansın diye ayrı, saf bir dosyada.
// `node:crypto` gibi yalnızca sunucuda çalışan bir şey içermez.
import { z } from "zod";

export const SEAT_MAX_QUANTITY = 1000;

export const seatQuantitySchema = z
  .number({ invalid_type_error: "Adet geçersiz." })
  .int("Adet tam sayı olmalı.")
  .min(1, "En az 1 kişilik kontenjan alınabilir.")
  .max(SEAT_MAX_QUANTITY, `En fazla ${SEAT_MAX_QUANTITY} kişilik kontenjan alınabilir.`);

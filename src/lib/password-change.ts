// Şifre değişikliği onayının ilkeleri (DB/ağ içermez; hem route'lar hem sayfa metinleri aynı değeri kullanır).

/** Onay bağlantısının geçerlilik süresi (dakika). */
export const PASSWORD_CHANGE_TTL_MINUTES = 30;
/** İki onay e-postası arasındaki en kısa süre (saniye). */
export const PASSWORD_CHANGE_COOLDOWN_SECONDS = 60;

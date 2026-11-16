import "server-only";
import type { PoolConnection } from "mysql2/promise";

/**
 * İade sonuçlanırken AYNI transaction içinde çalışır: erişim, hediye, kontenjan ve kupon etkilerini geri alır.
 * Sipariş durumunu çağıran (`finalize`) yazar; burada yalnızca yan etkiler vardır. (Task 6'da doldurulur.)
 */
export async function applyRefundEffects(_conn: PoolConnection, _order: { id: number; user_id: number; company_id: number | null }): Promise<void> {}

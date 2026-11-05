import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

/** Şirket satırını `FOR UPDATE` ile kilitler: aynı şirkette eş zamanlı atama/geri alma sırayla işler. Şirket yoksa false. */
export async function lockCompany(conn: PoolConnection, companyId: number): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT id FROM companies WHERE id = ? FOR UPDATE", [companyId]);
  return rows.length > 0;
}

import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import {
  canRemoveAdmin,
  corporateEmailBlock,
  generateCompanyCode,
  isPublicDomain,
  normalizeCompanyCode,
} from "@/lib/company-rules";

// Şirket, üyelik, kayıt niyeti ve katılım işleri. Kontenjan (atama/geri alma) `company-seats.ts`'tedir.

export type CompanyRef = { id: number; name: string; code: string; is_active: boolean };

export type Membership = { companyId: number; companyName: string; role: "member" | "admin"; status: "pending" | "active" };

export async function getMembership(userId: number): Promise<Membership | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT m.company_id, c.name, m.role, m.status
       FROM company_members m JOIN companies c ON c.id = m.company_id WHERE m.user_id = ? LIMIT 1`,
    [userId],
  );
  const r = rows[0];
  return r ? { companyId: r.company_id, companyName: r.name, role: r.role, status: r.status } : null;
}

/** Şirkete bağlı ve onaylı üye mi (şirket adminleri de üyedir). Onay bekleyen sayılmaz. */
export async function isActiveMember(userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM company_members WHERE user_id = ? AND status = 'active' LIMIT 1", [userId]);
  return rows.length > 0;
}

const toRef = (r: RowDataPacket): CompanyRef => ({ id: r.id, name: r.name, code: r.code, is_active: !!r.is_active });

/** Koda göre aktif şirket (pasif şirketlere katılınamaz). */
export async function findCompanyByCode(code: string): Promise<CompanyRef | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, name, code, is_active FROM companies WHERE code = ? AND is_active = 1 LIMIT 1", [normalizeCompanyCode(code)]);
  return rows[0] ? toRef(rows[0]) : null;
}

/** Mail uzantısına göre aktif şirket. */
export async function findCompanyByDomain(domain: string): Promise<CompanyRef | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT c.id, c.name, c.code, c.is_active FROM company_domains d JOIN companies c ON c.id = d.company_id WHERE d.domain = ? AND c.is_active = 1 LIMIT 1",
    [domain.toLowerCase()],
  );
  return rows[0] ? toRef(rows[0]) : null;
}

/** Uzantı herhangi bir (pasif dahil) şirkete ait mi: bir uzantı tek şirkete aittir. */
export async function domainIsTaken(domain: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM company_domains WHERE domain = ? LIMIT 1", [domain.toLowerCase()]);
  return rows.length > 0;
}

type NewCompany = { name: string; taxOffice: string; taxNumber: string; domain: string; adminUserId: number };

/** Şirket + uzantı + ilk admin üyeliği tek transaction'da. Kod çakışmasında yeni kod üretip en çok 5 kez dener. */
async function createCompany(i: NewCompany): Promise<{ ok: true; id: number; code: string } | { ok: false; reason: "domain_taken" | "already_member" }> {
  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query<RowDataPacket[]>("SELECT 1 FROM company_members WHERE user_id = ? LIMIT 1", [i.adminUserId]);
    if (existing.length > 0) {
      await conn.rollback();
      return { ok: false, reason: "already_member" };
    }
    let companyId = 0;
    let code = "";
    for (let attempt = 0; attempt < 5 && !companyId; attempt++) {
      code = generateCompanyCode(i.name);
      try {
        const [res] = await conn.execute<ResultSetHeader>("INSERT INTO companies (name, code, tax_office, tax_number) VALUES (?, ?, ?, ?)", [i.name, code, i.taxOffice, i.taxNumber]);
        companyId = res.insertId;
      } catch (err) {
        if ((err as { code?: string }).code !== "ER_DUP_ENTRY") throw err;
      }
    }
    if (!companyId) throw new Error("Şirket kodu üretilemedi.");
    try {
      await conn.execute("INSERT INTO company_domains (company_id, domain) VALUES (?, ?)", [companyId, i.domain]);
    } catch (err) {
      if ((err as { code?: string }).code !== "ER_DUP_ENTRY") throw err;
      await conn.rollback();
      return { ok: false, reason: "domain_taken" };
    }
    await conn.execute("INSERT INTO company_members (company_id, user_id, role, status, approved_at) VALUES (?, ?, 'admin', 'active', NOW())", [companyId, i.adminUserId]);
    await conn.commit();
    return { ok: true, id: companyId, code };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Kullanıcıyı şirkete "onay bekliyor" olarak ekler. Kullanıcı tek şirkete bağlı olabilir. */
export async function requestJoin(userId: number, companyId: number): Promise<"requested" | "already_member" | "inactive_company"> {
  const [co] = await pool.query<RowDataPacket[]>("SELECT 1 FROM companies WHERE id = ? AND is_active = 1", [companyId]);
  if (co.length === 0) return "inactive_company";
  const [res] = await pool.execute<ResultSetHeader>("INSERT IGNORE INTO company_members (company_id, user_id, role, status) VALUES (?, ?, 'member', 'pending')", [companyId, userId]);
  return res.affectedRows > 0 ? "requested" : "already_member";
}

// ── Kayıt niyeti ──────────────────────────────────────────────────────────────
export type SignupIntent =
  | { kind: "create"; company: { name: string; taxOffice: string; taxNumber: string; domain: string } }
  | { kind: "join"; code: string };

/** Kayıtta seçilen şirket niyeti. Yalnızca YENİ kullanıcı satırı açılırken çağrılır (yarım kalmış kayıt yeniden yapılınca niyet değişmez). */
export async function saveSignupIntent(userId: number, intent: SignupIntent): Promise<void> {
  const payload = intent.kind === "create" ? intent.company : { code: intent.code };
  await pool.execute("INSERT IGNORE INTO company_signup_intents (user_id, kind, payload) VALUES (?, ?, ?)", [userId, intent.kind, JSON.stringify(payload)]);
}

/**
 * E-posta doğrulandıktan sonra çağrılır: niyeti tüketir ve uygular. Asla fırlatmaz (doğrulamayı bozmasın); uygulanamazsa
 * kullanıcı bireysel hesap olarak kalır ve neden loglanır.
 */
export async function applySignupIntent(userId: number): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT kind, payload FROM company_signup_intents WHERE user_id = ?", [userId]);
    const row = rows[0];
    if (!row) return;
    const [del] = await pool.execute<ResultSetHeader>("DELETE FROM company_signup_intents WHERE user_id = ?", [userId]);
    if (del.affectedRows === 0) return; // eş zamanlı başka bir istek tüketti
    const data = JSON.parse(row.payload);
    if (row.kind === "join") {
      const company = await findCompanyByCode(String(data.code));
      if (!company) return console.error("[company] katılım niyeti: şirket kodu artık geçersiz", { userId });
      await requestJoin(userId, company.id);
      return;
    }
    const [users] = await pool.query<RowDataPacket[]>("SELECT email FROM users WHERE id = ?", [userId]);
    const email: string | undefined = users[0]?.email;
    const domain = String(data.domain);
    if (!email || isPublicDomain(domain) || corporateEmailBlock(email, domain)) return console.error("[company] şirket oluşturma niyeti: e-posta uzantısı uyuşmuyor", { userId });
    const made = await createCompany({ name: data.name, taxOffice: data.taxOffice, taxNumber: data.taxNumber, domain, adminUserId: userId });
    if (!made.ok) console.error("[company] şirket oluşturulamadı", { userId, reason: made.reason });
  } catch (err) {
    console.error("[company] kayıt niyeti uygulanamadı", { userId, err });
  }
}

// ── Üye işlemleri ─────────────────────────────────────────────────────────────
export type MemberAction = "approve" | "reject" | "promote" | "demote";
export type MemberResult = { ok: true } | { ok: false; reason: "not_found" | "last_admin" | "bad_state" };

/** Satır her zaman `company_id` ile birlikte aranır: başka şirketin üyesi bu şirketin yolundan bulunamaz. */
export async function resolveMember(companyId: number, memberId: number, action: MemberAction, actorId: number | null): Promise<MemberResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>("SELECT id, role, status FROM company_members WHERE id = ? AND company_id = ? FOR UPDATE", [memberId, companyId]);
    const m = rows[0];
    if (!m) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const bad = async () => {
      await conn.rollback();
      return { ok: false, reason: "bad_state" } as const;
    };
    if (action === "approve") {
      if (m.status !== "pending") return bad();
      await conn.execute("UPDATE company_members SET status = 'active', approved_at = NOW(), approved_by = ? WHERE id = ?", [actorId, memberId]);
    } else if (action === "reject") {
      if (m.status !== "pending") return bad();
      await conn.execute("DELETE FROM company_members WHERE id = ?", [memberId]);
    } else if (action === "promote") {
      if (m.status !== "active" || m.role !== "member") return bad();
      await conn.execute("UPDATE company_members SET role = 'admin' WHERE id = ?", [memberId]);
    } else {
      if (m.status !== "active" || m.role !== "admin") return bad();
      const [admins] = await conn.query<RowDataPacket[]>("SELECT id FROM company_members WHERE company_id = ? AND role = 'admin' AND status = 'active' FOR UPDATE", [companyId]);
      if (!canRemoveAdmin(admins.length)) {
        await conn.rollback();
        return { ok: false, reason: "last_admin" };
      }
      await conn.execute("UPDATE company_members SET role = 'member' WHERE id = ?", [memberId]);
    }
    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

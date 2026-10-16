// Admin kullanıcısı oluşturur ya da var olanı admin yapıp parolasını günceller.
// Parola komut satırı argümanı olarak GEÇİLMEZ (shell geçmişine düşmesin) → ortam değişkeni:
//   ADMIN_EMAIL=ad@alanadi.com ADMIN_PASSWORD='...' ADMIN_NAME='Ad Soyad' npm run db:create-admin
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Admin";
if (!email || !password) {
  console.error("ADMIN_EMAIL ve ADMIN_PASSWORD gerekli.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Parola en az 8 karakter olmalı.");
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const hash = await bcrypt.hash(password, 10);
await conn.execute(
  `INSERT INTO users (full_name, email, password_hash, role, is_active, email_verified)
   VALUES (?, ?, ?, 'admin', 1, 1)
   ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin', is_active = 1, email_verified = 1`,
  [name, email, hash],
);
console.log(`✓ admin hazır: ${email}`);
await conn.end();

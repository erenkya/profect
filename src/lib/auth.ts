// JWT + HttpOnly cookie oturumu (x-plore lib/auth.ts'den uyarlandı; jsonwebtoken yerine jose,
// böylece aynı doğrulama proxy.ts'te (edge) de çalışır).
import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { AUTH_COOKIE_NAME, USER_DATA_COOKIE_NAME } from "@/lib/auth-constants";

export { AUTH_COOKIE_NAME, USER_DATA_COOKIE_NAME };

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type Role = "user" | "admin";

export interface JwtPayload {
  userId: number;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface SessionUser {
  id: number;
  full_name: string;
  email: string;
  role: Role;
}

function secretKey() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET tanımlı değil.");
  return new TextEncoder().encode(s);
}

export async function generateJwt(p: { userId: number; email: string; role: Role }): Promise<string> {
  return new SignJWT({ userId: p.userId, email: p.email, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || "7d")
    .sign(secretKey());
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "number") return null;
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** JWT (HttpOnly) + arayüzün okuyabileceği hassas olmayan kullanıcı çerezi. */
export function setAuthCookies(res: NextResponse, token: string, user: SessionUser): NextResponse {
  res.cookies.set(AUTH_COOKIE_NAME, token, cookieOptions(MAX_AGE_SECONDS));
  res.cookies.set(USER_DATA_COOKIE_NAME, encodeURIComponent(JSON.stringify(user)), {
    ...cookieOptions(MAX_AGE_SECONDS),
    httpOnly: false,
  });
  return res;
}

export function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.set(AUTH_COOKIE_NAME, "", { ...cookieOptions(0), maxAge: 0 });
  res.cookies.set(USER_DATA_COOKIE_NAME, "", { ...cookieOptions(0), httpOnly: false, maxAge: 0 });
  return res;
}

/** Çerezdeki imzalı JWT'yi çözer (DB'ye gitmez). */
export async function getAuthFromCookies(): Promise<JwtPayload | null> {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  return token ? verifyJwt(token) : null;
}

type AccountState = { status: "active"; role: Role } | { status: "invalid" } | { status: "error" };

/**
 * JWT durumsuzdur; admin kullanıcıyı silse/pasifleştirse de 7 gün geçerli kalırdı.
 * Bu yüzden korumalı her istekte güncel durum + rol DB'den okunur (rol JWT'ye güvenilmez).
 * DB erişilemezse "error" döner ve çağıran oturumu açık bırakır (geçici kesintide herkes atılmasın).
 */
export async function getAccountState(userId: number): Promise<AccountState> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT is_active, role FROM users WHERE id = ?", [userId]);
    if (rows.length === 0 || !rows[0].is_active) return { status: "invalid" };
    return { status: "active", role: rows[0].role as Role };
  } catch (err) {
    console.error("[getAccountState]", err);
    return { status: "error" };
  }
}

function unauthorized(message = "Oturum gerekli.") {
  return NextResponse.json({ success: false, message }, { status: 401 });
}

function endedSession() {
  return clearAuthCookies(unauthorized("Oturum sonlandı: hesap artık aktif değil."));
}

type Guard =
  | { payload: JwtPayload; error?: undefined }
  | { payload?: undefined; error: NextResponse };

/** Giriş yapmış herhangi bir kullanıcı. API route'larında kimlik YALNIZCA buradan türetilir. */
export async function requireUser(): Promise<Guard> {
  const payload = await getAuthFromCookies();
  if (!payload) return { error: unauthorized() };
  const state = await getAccountState(payload.userId);
  if (state.status === "invalid") return { error: endedSession() };
  return { payload: state.status === "active" ? { ...payload, role: state.role } : payload };
}

export async function requireAdmin(): Promise<Guard> {
  const payload = await getAuthFromCookies();
  if (!payload) return { error: unauthorized() };
  const state = await getAccountState(payload.userId);
  if (state.status === "invalid") return { error: endedSession() };
  // DB erişilemiyorsa admin yetkisi VERİLMEZ (yetki yükseltme güvenli tarafta kalsın).
  if (state.status !== "active" || state.role !== "admin") {
    return { error: NextResponse.json({ success: false, message: "Yönetici yetkisi gerekli." }, { status: 403 }) };
  }
  return { payload: { ...payload, role: "admin" } };
}

/** Server component'ler için: oturumdaki kullanıcı (DB doğrulamalı) ya da null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const payload = await getAuthFromCookies();
  if (!payload) return null;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, full_name, email, role, is_active FROM users WHERE id = ?",
      [payload.userId],
    );
    const u = rows[0];
    if (!u || !u.is_active) return null;
    return { id: u.id, full_name: u.full_name, email: u.email, role: u.role };
  } catch (err) {
    console.error("[getCurrentUser]", err);
    return null;
  }
}

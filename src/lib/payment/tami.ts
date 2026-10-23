import "server-only";
import crypto from "node:crypto";

// Tami (Garanti BBVA ödeme kuruluşu) Sanal POS REST istemcisi — 3D Secure akışı.
// Protokol XellenceWeb/lib/tami-pos.ts ile aynıdır (orada canlı işlemle doğrulandı); bu projede ayrı bir
// Tami hesabı kullanılır, anahtarlar yalnızca bu projenin .env dosyasından okunur.
//   PG-Auth-Token  = "{merchant}:{terminal}:{Base64(SHA256(merchant + terminal + secretKey))}"
//   securityHash   = gövde üzerinde HS512 compact JWS (anahtar: JWK `k`, başlıkta `kid`)

type TamiMode = "test" | "prod";
type TamiConfig = { mode: TamiMode; merchantNumber: string; terminalNumber: string; secretKey: string; jwkK: string; jwkKid: string };

function readConfig(): TamiConfig | null {
  const { TAMI_MERCHANT_NUMBER: merchantNumber, TAMI_TERMINAL_NUMBER: terminalNumber, TAMI_SECRET_KEY: secretKey, TAMI_JWK_K: jwkK, TAMI_JWK_KID: jwkKid } = process.env;
  if (!merchantNumber || !terminalNumber || !secretKey || !jwkK || !jwkKid) return null;
  return { mode: process.env.TAMI_MODE === "prod" ? "prod" : "test", merchantNumber, terminalNumber, secretKey, jwkK, jwkKid };
}

export const tamiConfigured = () => readConfig() !== null;

const baseUrl = (mode: TamiMode) => (mode === "prod" ? "https://paymentapi.tami.com.tr" : "https://sandbox-paymentapi.tami.com.tr");

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function b64urlDecode(input: string): Buffer {
  const n = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(n + "=".repeat((4 - (n.length % 4)) % 4), "base64");
}

export function signBody(body: Record<string, unknown>, kid: string, kBase64Url: string): string {
  const head = b64url(Buffer.from(JSON.stringify({ alg: "HS512", typ: "JWT", kid }), "utf8"));
  const payload = b64url(Buffer.from(JSON.stringify(body), "utf8"));
  const sig = crypto.createHmac("sha512", b64urlDecode(kBase64Url)).update(`${head}.${payload}`, "utf8").digest();
  return `${head}.${payload}.${b64url(sig)}`;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const c = readConfig();
  if (!c) throw new Error("Tami yapılandırması eksik.");
  const hash = crypto.createHash("sha256").update(c.merchantNumber + c.terminalNumber + c.secretKey, "utf8").digest("base64");
  const res = await fetch(`${baseUrl(c.mode)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "tr",
      "PG-Api-Version": "v3",
      "PG-Auth-Token": `${c.merchantNumber}:${c.terminalNumber}:${hash}`,
      correlationId: crypto.randomUUID(),
    },
    body: JSON.stringify({ ...body, securityHash: signBody(body, c.jwkKid, c.jwkK) }),
    signal: AbortSignal.timeout(30_000),
  });
  return (await res.json()) as T;
}

type TamiError = { success: false; errorCode: number; errorMessage: string; correlationId: string };
export type TamiAddress = { address: string; city: string; district: string; country: string; zipCode: string; companyName?: string; contactName: string; phoneNumber: string; emailAddress?: string };

export type TamiAuth3DRequest = {
  orderId: string;
  amount: number;
  currency: "TRY";
  installmentCount: number;
  paymentGroup: "PRODUCT";
  paymentChannel: "WEB";
  callbackUrl: string;
  card: { number: string; holderName: string; expireMonth: number; expireYear: number; cvv: string };
  buyer: {
    ipAddress: string; buyerId: string; name: string; surName: string; identityNumber: string; emailAddress: string; phoneNumber: string;
    city: string; country: string; zipCode: string; registrationAddress: string; registrationDate: string; lastLoginDate: string;
  };
  billingAddress: TamiAddress;
  shippingAddress: TamiAddress;
  basket: { basketId: string; basketItems: { itemId: string; name: string; itemType: "PHYSICAL" | "VIRTUAL"; category: string; subCategory: string; numberOfProducts: number; unitPrice: number; totalPrice: number }[] };
};

export const authPayment3D = (req: TamiAuth3DRequest) =>
  call<{ success: true; correlationId: string; orderId: string; threeDSHtmlContent: string } | TamiError>("/payment/auth", req as unknown as Record<string, unknown>);

export const complete3DS = (orderId: string) =>
  call<{ success: true; orderId: string; amount: number; bankAuthCode: string; bankReferenceNumber: string; card: { binNumber: string; maskedNumber: string } } | TamiError>(
    "/payment/complete-3ds",
    { orderId },
  );

export type TamiCallbackPayload = {
  orderId: string; mdStatus: string; maskedNumber: string; cardBrand: string; cardOrganization: string; cardType: string;
  installmentCount: string | number; txnAmount: string | number; currencyCode: string; systemTime: string; success: string | boolean; hashedData: string;
};

/** 3D dönüş imzası: HMAC-SHA256(secretKey, alanların birleşimi) → base64. Sabit zamanlı karşılaştırılır. */
export function verifyCallbackSignature(p: TamiCallbackPayload, secretKey: string): boolean {
  const data = [p.cardOrganization, p.cardBrand, p.cardType, p.maskedNumber, p.installmentCount, p.currencyCode, p.txnAmount, p.orderId, p.systemTime, p.success].map(String).join("");
  const expected = Buffer.from(crypto.createHmac("sha256", secretKey).update(data, "utf8").digest("base64"));
  const got = Buffer.from(String(p.hashedData ?? ""));
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

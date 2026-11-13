import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { masterSecret } from "./config";

const keyCache = new Map<string, Buffer>();

/** Derive a purpose-bound 32-byte key from the master secret (HKDF-SHA256). */
export function deriveKey(purpose: string): Buffer {
  const secret = masterSecret();
  const cacheKey = `${secret.length}:${purpose}:${createHash("sha256").update(secret).digest("hex")}`;
  let k = keyCache.get(cacheKey);
  if (!k) {
    k = Buffer.from(hkdfSync("sha256", secret, "j-trace/v1", purpose, 32));
    keyCache.set(cacheKey, k);
  }
  return k;
}

/**
 * Keyed, deterministic pseudonym for an identifier (IMEI, phone, contact).
 * Lets us look records up without storing the identifier in the clear.
 * Purpose-separated so an IMEI pseudonym can never collide with a phone pseudonym.
 */
export function hmac(value: string, purpose: "imei" | "phone" | "contact" | "ip" | "key"): string {
  return createHmac("sha256", deriveKey(`hmac:${purpose}`)).update(value).digest("hex");
}

/** AES-256-GCM field encryption. Output: v1.<iv>.<ciphertext>.<tag> (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("field-encryption"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  const [v, iv, ct, tag] = blob.split(".");
  if (v !== "v1" || !iv || ct === undefined || !tag) throw new Error("Unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("field-encryption"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const SCRYPT_N = 16384;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function otpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L

export function randomRef(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[randomInt(0, REF_ALPHABET.length)];
  return out;
}

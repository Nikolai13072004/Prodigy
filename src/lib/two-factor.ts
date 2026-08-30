import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOTP_TIME_STEP_SECONDS = 30;
const TOTP_CODE_DIGITS = 6;
const TOTP_WINDOW_STEPS = 1;

function requireAuthSecret() {
  const secret =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTHJS_SECRET?.trim();

  if (!secret) {
    throw new Error("AUTH_SECRET обязателен для шифрования TOTP-секретов.");
  }

  return secret;
}

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let result = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}

function base32Decode(input: string) {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Некорректный base32-ключ для TOTP.");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function createTotpCounterBuffer(counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  return buffer;
}

function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomRecoveryChunk(length: number) {
  let result = "";

  while (result.length < length) {
    const byte = randomBytes(1)[0] ?? 0;
    result += RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
  }

  return result;
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function encryptTotpSecret(secret: string) {
  const key = createHash("sha256").update(requireAuthSecret()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(authTag)}.${base64UrlEncode(ciphertext)}`;
}

export function decryptTotpSecret(payload: string) {
  const [version, ivEncoded, authTagEncoded, ciphertextEncoded] = payload.split(".");
  if (version !== "v1" || !ivEncoded || !authTagEncoded || !ciphertextEncoded) {
    throw new Error("Некорректный формат зашифрованного TOTP-секрета.");
  }

  const key = createHash("sha256").update(requireAuthSecret()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, base64UrlDecode(ivEncoded));
  decipher.setAuthTag(base64UrlDecode(authTagEncoded));

  const plaintext = Buffer.concat([
    decipher.update(base64UrlDecode(ciphertextEncoded)),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function generateTotpCode(secret: string, now = Date.now()) {
  const counter = Math.floor(now / 1000 / TOTP_TIME_STEP_SECONDS);
  const digest = createHmac("sha1", base32Decode(secret)).update(createTotpCounterBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);

  return String(binary % 10 ** TOTP_CODE_DIGITS).padStart(TOTP_CODE_DIGITS, "0");
}

export function verifyTotpCode(secret: string, rawCode: string, now = Date.now()) {
  const code = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;

  const key = base32Decode(secret);
  const currentCounter = Math.floor(now / 1000 / TOTP_TIME_STEP_SECONDS);

  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;

    const digest = createHmac("sha1", key).update(createTotpCounterBuffer(counter)).digest();
    const dynamicOffset = digest[digest.length - 1] & 15;
    const binary =
      ((digest[dynamicOffset] & 127) << 24) |
      ((digest[dynamicOffset + 1] & 255) << 16) |
      ((digest[dynamicOffset + 2] & 255) << 8) |
      (digest[dynamicOffset + 3] & 255);
    const expected = String(binary % 10 ** TOTP_CODE_DIGITS).padStart(TOTP_CODE_DIGITS, "0");

    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      return true;
    }
  }

  return false;
}

export function buildTotpOtpAuthUrl({
  secret,
  accountName,
  issuer,
}: {
  secret: string;
  accountName: string;
  issuer: string;
}) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const search = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_CODE_DIGITS),
    period: String(TOTP_TIME_STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${search.toString()}`;
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => `${randomRecoveryChunk(4)}-${randomRecoveryChunk(4)}`);
}

export function hashRecoveryCode(value: string) {
  return createHash("sha256").update(normalizeRecoveryCode(value)).digest("hex");
}

export function consumeRecoveryCode(recoveryCodesJson: string, rawCode: string) {
  const hashes = JSON.parse(recoveryCodesJson) as string[];
  const targetHash = hashRecoveryCode(rawCode);
  const nextHashes: string[] = [];
  let matched = false;

  for (const hash of hashes) {
    if (!matched && hash.length === targetHash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(targetHash))) {
      matched = true;
      continue;
    }

    nextHashes.push(hash);
  }

  return {
    matched,
    nextRecoveryCodesJson: JSON.stringify(nextHashes),
    remainingCount: nextHashes.length,
  };
}

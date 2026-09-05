import assert from "node:assert/strict";
import { test } from "node:test";

// TOTP-секреты шифруются ключом из AUTH_SECRET — задаём до вызова шифрования.
process.env.AUTH_SECRET = "test-auth-secret-2fa";

import {
  buildTotpOtpAuthUrl,
  consumeRecoveryCode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from "./two-factor";

// Эталонный ключ RFC 6238: ASCII "12345678901234567890" в base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// ------------------------------------------------------------ generateTotpCode

test("generateTotpCode совпадает с тест-векторами RFC 6238 (младшие 6 цифр)", () => {
  // RFC-вектора 8-значные; реализация берёт 6 цифр → это их «хвост».
  assert.equal(generateTotpCode(RFC_SECRET, 59_000), "287082");
  assert.equal(generateTotpCode(RFC_SECRET, 1_111_111_109_000), "081804");
  assert.equal(generateTotpCode(RFC_SECRET, 1_234_567_890_000), "005924");
});

test("generateTotpSecret даёт непустой base32-ключ, пригодный для кода", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/, "только алфавит base32");
  assert.match(generateTotpCode(secret, 0), /^\d{6}$/);
});

// ------------------------------------------------------------ verifyTotpCode

test("verifyTotpCode принимает текущий код и терпит пробелы", () => {
  const code = generateTotpCode(RFC_SECRET, 59_000);
  assert.equal(verifyTotpCode(RFC_SECRET, code, 59_000), true);
  assert.equal(verifyTotpCode(RFC_SECRET, "287 082", 59_000), true, "пробелы отбрасываются");
});

test("verifyTotpCode допускает окно ±1 шаг (30 c)", () => {
  const code = generateTotpCode(RFC_SECRET, 59_000); // counter = 1
  // спустя один шаг код прошлой ячейки ещё принимается
  assert.equal(verifyTotpCode(RFC_SECRET, code, 89_000), true, "предыдущий шаг");
  // через два шага — уже нет
  assert.equal(verifyTotpCode(RFC_SECRET, code, 120_000), false, "вне окна");
});

test("verifyTotpCode отклоняет неверный формат и неверный код", () => {
  assert.equal(verifyTotpCode(RFC_SECRET, "12345", 59_000), false, "мало цифр");
  assert.equal(verifyTotpCode(RFC_SECRET, "abcdef", 59_000), false, "не цифры");
  assert.equal(verifyTotpCode(RFC_SECRET, "000000", 59_000), false, "неверный код");
});

// ------------------------------------------------- encrypt / decrypt (AES-GCM)

test("шифрование TOTP-секрета обратимо и версионировано", () => {
  const secret = generateTotpSecret();
  const payload = encryptTotpSecret(secret);
  assert.match(payload, /^v1\./, "формат помечен версией");
  assert.equal(decryptTotpSecret(payload), secret);
});

test("decryptTotpSecret отвергает битый формат и подделку", () => {
  assert.throws(() => decryptTotpSecret("v2.a.b.c"), /формат/);
  assert.throws(() => decryptTotpSecret("мусор"), /формат/);
  const payload = encryptTotpSecret("HELLO");
  const parts = payload.split(".");
  parts[3] = Buffer.from("подделка").toString("base64url"); // испорченный шифротекст
  assert.throws(() => decryptTotpSecret(parts.join(".")), "GCM должен поймать подмену");
});

// ------------------------------------------------------- buildTotpOtpAuthUrl

test("buildTotpOtpAuthUrl собирает корректный otpauth://", () => {
  const url = buildTotpOtpAuthUrl({ secret: RFC_SECRET, accountName: "user@corp.ru", issuer: "Smart LMS" });
  assert.match(url, /^otpauth:\/\/totp\//);
  const parsed = new URL(url);
  assert.equal(parsed.host, "totp");
  assert.equal(decodeURIComponent(parsed.pathname).replace(/^\//, ""), "Smart LMS:user@corp.ru");
  assert.equal(parsed.searchParams.get("secret"), RFC_SECRET);
  assert.equal(parsed.searchParams.get("issuer"), "Smart LMS");
  assert.equal(parsed.searchParams.get("algorithm"), "SHA1");
  assert.equal(parsed.searchParams.get("digits"), "6");
  assert.equal(parsed.searchParams.get("period"), "30");
});

// ------------------------------------------------------- recovery codes

test("generateRecoveryCodes: нужное количество, формат XXXX-XXXX без двусмысленных символов", () => {
  const codes = generateRecoveryCodes(5);
  assert.equal(codes.length, 5);
  for (const code of codes) {
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, `формат кода: ${code}`);
  }
});

test("hashRecoveryCode нормализует регистр и разделители", () => {
  const canonical = hashRecoveryCode("ABCD2345");
  assert.equal(hashRecoveryCode("abcd-2345"), canonical, "регистр и дефис не важны");
  assert.equal(hashRecoveryCode(" ab cd 23 45 "), canonical, "пробелы не важны");
  assert.match(canonical, /^[0-9a-f]{64}$/, "sha256 hex");
});

test("consumeRecoveryCode гасит ровно один код и идемпотентен при повторе", () => {
  const raw = "ABCD-2345";
  const other = hashRecoveryCode("WXYZ-6789");
  const json = JSON.stringify([hashRecoveryCode(raw), other]);

  const first = consumeRecoveryCode(json, raw);
  assert.equal(first.matched, true);
  assert.equal(first.remainingCount, 1);
  assert.deepEqual(JSON.parse(first.nextRecoveryCodesJson), [other], "погашен только использованный");

  const second = consumeRecoveryCode(first.nextRecoveryCodesJson, raw);
  assert.equal(second.matched, false, "повторно тот же код не срабатывает");
  assert.equal(second.remainingCount, 1);
});

test("consumeRecoveryCode: неизвестный код не меняет набор", () => {
  const json = JSON.stringify([hashRecoveryCode("AAAA-2222")]);
  const result = consumeRecoveryCode(json, "ZZZZ-9999");
  assert.equal(result.matched, false);
  assert.equal(result.remainingCount, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { resolveSmtpAuth } from "./smtp-auth-resolution";

const PLATFORM = { login: "platform-user", password: "platform-pass" };
const ENV = { login: "env-user", password: "env-pass" };

test("при источнике PLATFORM приоритет у сохранённых настроек", () => {
  assert.deepEqual(resolveSmtpAuth({ usePlatformSettings: true, platform: PLATFORM, env: ENV }), {
    user: "platform-user",
    pass: "platform-pass",
  });
});

test("при источнике ENV приоритет у переменных окружения", () => {
  assert.deepEqual(resolveSmtpAuth({ usePlatformSettings: false, platform: PLATFORM, env: ENV }), {
    user: "env-user",
    pass: "env-pass",
  });
});

test("недостающее значение добирается из второго источника", () => {
  assert.deepEqual(
    resolveSmtpAuth({
      usePlatformSettings: true,
      platform: { login: null, password: "platform-pass" },
      env: ENV,
    }),
    { user: "env-user", pass: "platform-pass" }
  );
});

// Логин и пароль обязаны браться из одного снимка настроек. Иначе при ротации
// обоих значений между двумя чтениями базы можно собрать логин от старой записи
// с паролем от новой — и получить отказ аутентификации на живой отправке.
test("логин и пароль платформы берутся из одной пары, а не смешиваются", () => {
  const rotated = { login: "new-user", password: "new-pass" };

  const resolved = resolveSmtpAuth({ usePlatformSettings: true, platform: rotated, env: ENV });

  assert.equal(resolved.user, "new-user");
  assert.equal(resolved.pass, "new-pass");
});

test("пустые источники дают пустой результат, а не подстановку мусора", () => {
  assert.deepEqual(
    resolveSmtpAuth({
      usePlatformSettings: true,
      platform: { login: null, password: null },
      env: { login: null, password: null },
    }),
    { user: null, pass: null }
  );
});

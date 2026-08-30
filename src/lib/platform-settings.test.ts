import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformSettings } from "@prisma/client";
import { toPlatformSettingsState } from "./platform-settings";

// Состояние настроек уезжает в браузер: admin/settings передаёт его целиком
// в клиентский GeneralPlatformSettingsForm, а Next сериализует props в RSC
// payload независимо от того, какие поля компонент читает. Поэтому секретов
// в этом объекте быть не должно физически.
const SECRET_FIELDS = ["smtpPassword"];

function recordWith(overrides: Partial<PlatformSettings>): PlatformSettings {
  return {
    id: "platform",
    smtpSettingsSource: "PLATFORM",
    smtpHost: "smtp.example.test",
    smtpPort: 587,
    smtpLogin: "mailer@example.test",
    smtpPassword: null,
    ...overrides,
  } as unknown as PlatformSettings;
}

test("состояние настроек не содержит SMTP-пароль — он не должен попасть в RSC payload", () => {
  const state = toPlatformSettingsState(
    recordWith({ smtpPassword: "секрет-который-не-должен-уехать-в-браузер" })
  );

  for (const field of SECRET_FIELDS) {
    assert.equal(
      Object.hasOwn(state, field),
      false,
      `поле ${field} присутствует в состоянии и утечёт в браузер вместе с props`
    );
  }

  assert.equal(
    JSON.stringify(state).includes("секрет-который-не-должен-уехать-в-браузер"),
    false,
    "значение пароля обнаружено в сериализованном состоянии"
  );
});

test("вместо пароля состояние сообщает лишь факт его наличия", () => {
  const withPassword = toPlatformSettingsState(recordWith({ smtpPassword: "какой-то-пароль" }));
  const withoutPassword = toPlatformSettingsState(recordWith({ smtpPassword: null }));

  assert.equal(withPassword.smtpPasswordSet, true);
  assert.equal(withoutPassword.smtpPasswordSet, false);
});

test("пробельный пароль не считается заданным", () => {
  const state = toPlatformSettingsState(recordWith({ smtpPassword: "   " }));
  assert.equal(state.smtpPasswordSet, false);
});

test("несекретные SMTP-поля остаются доступными форме", () => {
  const state = toPlatformSettingsState(recordWith({ smtpPassword: "секрет" }));

  assert.equal(state.smtpHost, "smtp.example.test");
  assert.equal(state.smtpPort, 587);
  assert.equal(state.smtpLogin, "mailer@example.test");
});

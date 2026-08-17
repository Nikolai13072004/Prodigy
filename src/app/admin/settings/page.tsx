import Link from "next/link";
import {
  saveGeneralPlatformSettings,
  saveMaintenancePlatformSettings,
  saveReminderPlatformSettings,
  saveSecurityPlatformSettings,
} from "@/app/actions/platform-settings-actions";
import { EmailTemplatesList } from "@/app/admin/settings/EmailTemplatesList";
import { GeneralPlatformSettingsForm } from "@/app/admin/settings/GeneralPlatformSettingsForm";
import { LocalMailClientEmailTester } from "@/app/admin/settings/LocalMailClientEmailTester";
import { getSmtpAuthType } from "@/lib/email/smtp-transport";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { getPlatformSettings, type PlatformSettingsState } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";

type Props = {
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    error?: string;
    connectionStatus?: string;
    connectionMessage?: string;
  }>;
};

function getTab(value?: string) {
  if (value === "email" || value === "security" || value === "reminders") return value;
  return "general";
}

function TabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-white text-[#0f315d] shadow-[inset_0_-3px_0_#0f315d]"
          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function PlatformSettingsPage({ searchParams }: Props) {
  const session = await requirePlatformAdmin();
  const sp = await searchParams;
  const tab = getTab(sp.tab);
  const [settings, emailPreviewData] = await Promise.all([
    getPlatformSettings(),
    tab === "email"
      ? getEmailTemplatePreviewData()
      : Promise.resolve({ courses: [], users: [] }),
  ]);
  const smtpAuthType = getSmtpAuthType();
  const mailtoTestRecipient = session.user.email ?? settings.supportEmail ?? settings.smtpFromEmail ?? "";

  return (
    <main className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Настройки платформы</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Управляйте брендингом LMS и параметрами отправки писем из единого административного раздела.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <TabLink href="/admin/settings?tab=general" label="Общие" active={tab === "general"} />
        <TabLink href="/admin/settings?tab=email" label="Email" active={tab === "email"} />
        <TabLink href="/admin/settings?tab=reminders" label="Напоминания" active={tab === "reminders"} />
        <TabLink href="/admin/settings?tab=security" label="Безопасность" active={tab === "security"} />
      </div>

      {sp.error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.error}
        </div>
      ) : null}

      {sp.saved === "general" ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Общие настройки платформы сохранены.
        </div>
      ) : null}

      {sp.saved === "email" ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Email-настройки сохранены.
        </div>
      ) : null}

      {sp.connectionStatus === "success" ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {sp.connectionMessage || "SMTP-подключение подтверждено."}
        </div>
      ) : null}

      {sp.connectionStatus === "error" ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.connectionMessage || "Не удалось проверить SMTP-подключение."}
        </div>
      ) : null}

      {sp.saved === "security" ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Политики безопасности сохранены.
        </div>
      ) : null}

      {sp.saved === "maintenance" ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Режим обслуживания обновлен.
        </div>
      ) : null}

      {sp.saved === "reminders" ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Настройки напоминаний сохранены.
        </div>
      ) : null}

      {tab === "general" ? (
        <GeneralPlatformSettingsForm action={saveGeneralPlatformSettings} settings={settings} />
      ) : tab === "email" ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form
            action="/admin/settings/email"
            method="post"
            className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">Настройки - Email</h2>
              <p className="mt-2 text-sm text-zinc-600">
                SMTP-параметры используются email worker для отправки системных писем и приглашений.
              </p>
            </div>

            <div className="mt-6 space-y-6">
              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-950">SMTP и отправитель</h3>
                    {smtpAuthType === "oauth2" ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        OAuth2 включен через переменные окружения. Пароль SMTP для отправки не используется.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    name="intent"
                    value="checkConnection"
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Проверить подключение
                  </button>
                </div>
                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2 rounded-xl border border-zinc-200 bg-white p-3">
                    <p className="text-sm font-medium text-zinc-900">Источник настроек для отправки</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50">
                        <input
                          type="radio"
                          name="smtpSettingsSource"
                          value="ENV"
                          defaultChecked={settings.smtpSettingsSource === "ENV"}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium text-zinc-950">Окружение (.env)</span>
                          <span className="block text-xs text-zinc-500">SMTP_* из контейнера</span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50">
                        <input
                          type="radio"
                          name="smtpSettingsSource"
                          value="PLATFORM"
                          defaultChecked={settings.smtpSettingsSource === "PLATFORM"}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium text-zinc-950">Сохранённые настройки</span>
                          <span className="block text-xs text-zinc-500">Поля SMTP ниже</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="smtpHost" className="block text-sm font-medium text-zinc-900">
                      SMTP-хост
                    </label>
                    <input
                      id="smtpHost"
                      name="smtpHost"
                      defaultValue={settings.smtpHost ?? ""}
                      placeholder="smtp.company.ru"
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="smtpPort" className="block text-sm font-medium text-zinc-900">
                      Порт
                    </label>
                    <input
                      id="smtpPort"
                      name="smtpPort"
                      type="number"
                      defaultValue={settings.smtpPort ?? ""}
                      placeholder="587"
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="smtpEncryption" className="block text-sm font-medium text-zinc-900">
                      Шифрование
                    </label>
                    <select
                      id="smtpEncryption"
                      name="smtpEncryption"
                      defaultValue={settings.smtpEncryption}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    >
                      <option value="TLS">TLS</option>
                      <option value="SSL">SSL</option>
                      <option value="NONE">Без шифрования</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="smtpLogin" className="block text-sm font-medium text-zinc-900">
                      Логин
                    </label>
                    <input
                      id="smtpLogin"
                      name="smtpLogin"
                      defaultValue={settings.smtpLogin ?? ""}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="smtpPassword" className="block text-sm font-medium text-zinc-900">
                      {smtpAuthType === "oauth2" ? "Пароль (не используется при OAuth2)" : "Пароль"}
                    </label>
                    <input
                      id="smtpPassword"
                      name="smtpPassword"
                      type="password"
                      placeholder={
                        settings.smtpPasswordSet
                          ? "Пароль сохранён — оставьте пустым, чтобы не менять"
                          : "Пароль не задан"
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="smtpFromEmail" className="block text-sm font-medium text-zinc-900">
                      Email отправителя
                    </label>
                    <input
                      id="smtpFromEmail"
                      name="smtpFromEmail"
                      type="email"
                      defaultValue={settings.smtpFromEmail ?? ""}
                      placeholder="noreply@company.ru"
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="smtpFromName" className="block text-sm font-medium text-zinc-900">
                      Имя отправителя
                    </label>
                    <input
                      id="smtpFromName"
                      name="smtpFromName"
                      defaultValue={settings.smtpFromName ?? ""}
                      placeholder="Корпоративное обучение"
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>
                </div>
              </section>

              <EmailTemplatesList
                templates={{
                  welcome: settings.welcomeEmailTemplate,
                  passwordReset: settings.passwordResetEmailTemplate,
                  certificate: settings.certificateEmailTemplate,
                  courseAssigned: settings.courseAssignedEmailTemplate,
                }}
                linkTtlHours={settings.userActivationInviteTtlDays * 24}
                previewData={emailPreviewData}
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                name="intent"
                value="save"
                className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Сохранить email-настройки
              </button>
            </div>
          </form>

          <aside className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Подсказка</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-600">
              <p>Источник отправки выбирается в блоке SMTP: окружение контейнера или сохраненный SMTP-профиль.</p>
              <p>В режиме окружения worker берет SMTP_* из .env; в режиме сохраненных настроек сначала используются поля формы.</p>
              <p>Текущий пароль не показываем в форме: пустое поле сохраняет уже заданный секрет.</p>
            </div>
            <LocalMailClientEmailTester
              defaultRecipient={mailtoTestRecipient}
              linkTtlHours={settings.userActivationInviteTtlDays * 24}
              siteName={settings.siteName}
              templates={{
                welcome: settings.welcomeEmailTemplate,
                passwordReset: settings.passwordResetEmailTemplate,
                courseAssigned: settings.courseAssignedEmailTemplate,
                certificate: settings.certificateEmailTemplate,
              }}
            />
          </aside>
        </section>
      ) : tab === "reminders" ? (
        <ReminderSettingsSection settings={settings} />
      ) : (
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form action={saveSecurityPlatformSettings} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">Настройки - Безопасность</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Управляйте правилами для новых паролей, сроком жизни сессии и автоматической защитой от перебора пароля.
              </p>
            </div>

            <div className="mt-6 space-y-6">
              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <h3 className="text-sm font-semibold text-zinc-950">Политика паролей</h3>
                <div className="mt-4 grid gap-5 md:grid-cols-2">

                  <div>
                    <label htmlFor="passwordMinLength" className="block text-sm font-medium text-zinc-900">
                      Минимальная длина пароля
                    </label>
                    <input
                      id="passwordMinLength"
                      name="passwordMinLength"
                      type="number"
                      min={8}
                      max={16}
                      defaultValue={settings.passwordMinLength}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-2 text-xs text-zinc-500">Допустимый диапазон: от 8 до 16 символов.</p>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <span className="block text-sm font-medium text-zinc-900">Обязательные требования</span>
                    <div className="mt-3 space-y-3 text-sm text-zinc-700">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="passwordRequireNumber"
                          defaultChecked={settings.passwordRequireNumber}
                          className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span>Требовать хотя бы одну цифру</span>
                      </label>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="passwordRequireUppercase"
                          defaultChecked={settings.passwordRequireUppercase}
                          className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span>Требовать хотя бы одну заглавную букву</span>
                      </label>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="passwordRequireSpecialChar"
                          defaultChecked={settings.passwordRequireSpecialChar}
                          className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span>Требовать хотя бы один спецсимвол</span>
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <h3 className="text-sm font-semibold text-zinc-950">Двухфакторная аутентификация</h3>
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <label className="flex items-start gap-3 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      name="adminTotpRequired"
                      defaultChecked={settings.adminTotpRequired}
                      className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                    <span>
                      Требовать Google Authenticator для всех администраторов.
                      <span className="mt-1 block text-xs text-zinc-500">
                        После включения каждый администратор при следующем входе должен будет подключить TOTP и сохранить recovery-коды.
                      </span>
                    </span>
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <h3 className="text-sm font-semibold text-zinc-950">Ссылки приглашений</h3>
                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="userActivationInviteTtlDays" className="block text-sm font-medium text-zinc-900">
                      Активация нового пользователя, дни
                    </label>
                    <input
                      id="userActivationInviteTtlDays"
                      name="userActivationInviteTtlDays"
                      type="number"
                      min={1}
                      max={365}
                      defaultValue={settings.userActivationInviteTtlDays}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-2 text-xs text-zinc-500">Сколько дней действительна ссылка из письма новому пользователю.</p>
                  </div>

                  <div>
                    <label htmlFor="courseInviteTtlDays" className="block text-sm font-medium text-zinc-900">
                      Приглашение на курс, дни
                    </label>
                    <input
                      id="courseInviteTtlDays"
                      name="courseInviteTtlDays"
                      type="number"
                      min={1}
                      max={365}
                      defaultValue={settings.courseInviteTtlDays}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-2 text-xs text-zinc-500">Сколько дней действует ссылка приглашения внешнего ученика на курс.</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-zinc-500">
                  Новые значения применяются только к вновь созданным ссылкам. Уже отправленные ссылки сохраняют ранее рассчитанную дату истечения.
                </p>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <h3 className="text-sm font-semibold text-zinc-950">Сессии и вход</h3>
                <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label htmlFor="sessionMaxAgeMinutes" className="block text-sm font-medium text-zinc-900">
                      Время жизни сессии, минуты
                    </label>
                    <input
                      id="sessionMaxAgeMinutes"
                      name="sessionMaxAgeMinutes"
                      type="number"
                      min={15}
                      max={43200}
                      defaultValue={settings.sessionMaxAgeMinutes}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-2 text-xs text-zinc-500">Например, 60 минут = 1 час.</p>
                  </div>

                  <div>
                    <label htmlFor="sessionIdleTimeoutMinutes" className="block text-sm font-medium text-zinc-900">
                      Таймаут бездействия, минуты
                    </label>
                    <input
                      id="sessionIdleTimeoutMinutes"
                      name="sessionIdleTimeoutMinutes"
                      type="number"
                      min={0}
                      max={1440}
                      defaultValue={settings.sessionIdleTimeoutMinutes}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-2 text-xs text-zinc-500">0 отключает проверку бездействия.</p>
                  </div>

                  <div>
                    <label htmlFor="maxFailedLoginAttempts" className="block text-sm font-medium text-zinc-900">
                      Лимит неудачных попыток входа
                    </label>
                    <input
                      id="maxFailedLoginAttempts"
                      name="maxFailedLoginAttempts"
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={settings.maxFailedLoginAttempts}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="loginLockoutMinutes" className="block text-sm font-medium text-zinc-900">
                      Блокировка после лимита, минуты
                    </label>
                    <input
                      id="loginLockoutMinutes"
                      name="loginLockoutMinutes"
                      type="number"
                      min={1}
                      max={1440}
                      defaultValue={settings.loginLockoutMinutes}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <h3 className="text-sm font-semibold text-zinc-950">Хранение логов</h3>
                <div className="mt-4 grid gap-5 md:grid-cols-2">

                  <div>
                    <label htmlFor="loginEventRetentionDays" className="block text-sm font-medium text-zinc-900">
                      Срок хранения логов входа, дни
                    </label>
                    <input
                      id="loginEventRetentionDays"
                      name="loginEventRetentionDays"
                      type="number"
                      min={90}
                      max={3650}
                      defaultValue={settings.loginEventRetentionDays}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      При уменьшении срока хранения старые события входа будут очищены автоматически.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="auditLogRetentionDays" className="block text-sm font-medium text-zinc-900">
                      Срок хранения аудит-лога, дни
                    </label>
                    <input
                      id="auditLogRetentionDays"
                      name="auditLogRetentionDays"
                      type="number"
                      min={90}
                      max={3650}
                      defaultValue={settings.auditLogRetentionDays}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      Записи по действиям администраторов и экспортам тоже будут очищаться по этому сроку.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <button
              type="submit"
              className="mt-6 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Сохранить политики безопасности
            </button>
          </form>

          <div className="space-y-6">
            <aside className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-950">Что применится сразу</h2>
              <div className="mt-4 space-y-3 text-sm text-zinc-600">
                <p>Новые правила пароля будут использоваться при создании пользователей, сбросе пароля и регистрации по приглашению.</p>
                <p>Сроки жизни приглашений применяются к новым ссылкам активации пользователей и приглашениям на курс.</p>
                <p>При включении 2FA каждый администратор будет направлен на подключение Google Authenticator перед следующим полноценным входом.</p>
                <p>Срок жизни сессии и таймаут бездействия начнут применяться к новым и обновляемым сессиям `next-auth`.</p>
                <p>После превышения лимита неудачных входов пользователь временно не сможет войти даже с верным паролем.</p>
                <p>Retention распространяется и на журнал входов, и на новый аудит-лог административных действий.</p>
              </div>
            </aside>

            <form action={saveMaintenancePlatformSettings} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-950">Режим обслуживания</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Во время обслуживания доступ к платформе сохраняют только администраторы. Остальные пользователи будут перенаправлены на сервисную страницу с вашим сообщением.
              </p>

              <div className="mt-5 space-y-4">
                <label className="flex items-start gap-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    name="maintenanceMode"
                    defaultChecked={settings.maintenanceMode}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span>
                    Включить режим обслуживания
                    <span className="mt-1 block text-xs text-zinc-500">
                      Ученики, HR и остальные неадминские пользователи не смогут открыть платформу и войти в неё, пока режим активен.
                    </span>
                  </span>
                </label>

                <div>
                  <label htmlFor="maintenanceMessage" className="block text-sm font-medium text-zinc-900">
                    Сообщение для пользователей
                  </label>
                  <textarea
                    id="maintenanceMessage"
                    name="maintenanceMessage"
                    defaultValue={settings.maintenanceMessage ?? ""}
                    rows={4}
                    placeholder="Платформа обновляется, вернемся через 2 часа."
                    className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm outline-none ring-teal-500 focus:ring-2"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Если поле пустое, пользователи увидят стандартное сообщение о технических работах.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="mt-5 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Сохранить режим обслуживания
              </button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}

function ReminderSettingsSection({ settings }: { settings: PlatformSettingsState }) {
  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form action={saveReminderPlatformSettings} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Напоминания по курсам</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Эти настройки использует worker напоминаний: он ставит письма в очередь, но фактическую отправку по-прежнему выполняет email worker.
          </p>
        </div>

        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <label className="flex items-start gap-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="courseRemindersEnabled"
                defaultChecked={settings.courseRemindersEnabled}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span>
                Включить автоматические напоминания по курсам
                <span className="mt-1 block text-xs text-zinc-500">
                  Если выключить, worker пропустит все типы напоминаний и не будет создавать новые письма.
                </span>
              </span>
            </label>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <h3 className="text-sm font-semibold text-zinc-950">Типы событий</h3>
            <div className="mt-4 grid gap-3 text-sm text-zinc-700 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <input
                  type="checkbox"
                  name="courseReminderNotStartedEnabled"
                  defaultChecked={settings.courseReminderNotStartedEnabled}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span>
                  Курс назначен, но не начат
                  <span className="mt-1 block text-xs text-zinc-500">Помогает быстро вернуть ученика к старту обучения.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <input
                  type="checkbox"
                  name="courseReminderExpiringEnabled"
                  defaultChecked={settings.courseReminderExpiringEnabled}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span>
                  Скоро закончится доступ
                  <span className="mt-1 block text-xs text-zinc-500">Срабатывает за выбранное количество дней до даты доступа.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <input
                  type="checkbox"
                  name="courseReminderExpiredEnabled"
                  defaultChecked={settings.courseReminderExpiredEnabled}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span>
                  Доступ уже закончился
                  <span className="mt-1 block text-xs text-zinc-500">Фиксирует просроченные назначения в коммуникациях.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <input
                  type="checkbox"
                  name="courseReminderQuizFailedEnabled"
                  defaultChecked={settings.courseReminderQuizFailedEnabled}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span>
                  Тест не сдан
                  <span className="mt-1 block text-xs text-zinc-500">Отправляется, если лучший результат по тесту остался неуспешным.</span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <label htmlFor="courseReminderExpiringDays" className="block text-sm font-medium text-zinc-900">
              Предупреждать об окончании доступа за, дней
            </label>
            <input
              id="courseReminderExpiringDays"
              name="courseReminderExpiringDays"
              type="number"
              min={1}
              max={60}
              defaultValue={settings.courseReminderExpiringDays}
              className="mt-2 h-11 w-full max-w-xs rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
            <p className="mt-2 text-xs text-zinc-500">Диапазон: от 1 до 60 дней.</p>
          </section>
        </div>

        <button
          type="submit"
          className="mt-6 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Сохранить напоминания
        </button>
      </form>

      <aside className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Как это работает</h2>
        <div className="mt-4 space-y-3 text-sm text-zinc-600">
          <p>Worker создает не больше одного письма каждого типа в день на пару ученик-курс.</p>
          <p>Сами письма видны в очереди email и в карточке ученика, поэтому можно проверить, что именно было поставлено.</p>
          <p>Изменения применяются при следующем запуске worker-а напоминаний.</p>
        </div>
      </aside>
    </section>
  );
}

async function getEmailTemplatePreviewData() {
  const [courses, users] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      take: 50,
      select: {
        id: true,
        title: true,
      },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        email: { not: null },
      },
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true,
        firstName: true,
        name: true,
        email: true,
      },
    }),
  ]);

  return {
    courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      url: `/courses/${course.id}`,
    })),
    users: users.map((user) => ({
      id: user.id,
      firstName: user.firstName || user.name.split(/\s+/)[0] || user.name,
      name: user.name,
      email: user.email ?? "",
    })),
  };
}

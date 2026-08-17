"use client";

import { useActionState, useMemo, useState } from "react";
import { BrandAssetInput } from "@/components/BrandAssetInput";
import {
  INITIAL_GENERAL_PLATFORM_SETTINGS_FORM_STATE,
  type GeneralPlatformSettingsFormState,
  type GeneralPlatformSettingsFormValues,
} from "@/app/admin/settings/general-platform-settings-form-state";
import {
  PLATFORM_DATE_FORMATS,
  PLATFORM_TIME_FORMATS,
  PLATFORM_TIME_ZONES,
  formatPlatformPreviewDateTime,
  type PlatformDateFormat,
  type PlatformTimeFormat,
} from "@/lib/platform-localization";
import type { PlatformSettingsState } from "@/lib/platform-settings";

type Props = {
  action: (
    state: GeneralPlatformSettingsFormState,
    formData: FormData
  ) => Promise<GeneralPlatformSettingsFormState>;
  settings: PlatformSettingsState;
};

type FormBodyProps = {
  error: string | null;
  formAction: (payload: FormData) => void;
  initialValues: GeneralPlatformSettingsFormValues;
  pending: boolean;
};

function getInitialValues(settings: PlatformSettingsState): GeneralPlatformSettingsFormValues {
  return {
    siteName: settings.siteName,
    siteDescription: settings.siteDescription,
    supportEmail: settings.supportEmail ?? "",
    feedbackEnabled: settings.feedbackEnabled,
    feedbackModerationEnabled: settings.feedbackModerationEnabled,
    logoUrl: settings.logoUrl ?? "",
    faviconUrl: settings.faviconUrl ?? "",
    timeZone: settings.timeZone,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
  };
}

function GeneralPlatformSettingsFormBody({ error, formAction, initialValues, pending }: FormBodyProps) {
  const [siteName, setSiteName] = useState(initialValues.siteName);
  const [siteDescription, setSiteDescription] = useState(initialValues.siteDescription);
  const [supportEmail, setSupportEmail] = useState(initialValues.supportEmail);
  const [feedbackEnabled, setFeedbackEnabled] = useState(initialValues.feedbackEnabled);
  const [feedbackModerationEnabled, setFeedbackModerationEnabled] = useState(initialValues.feedbackModerationEnabled);
  const [logoUrl, setLogoUrl] = useState(initialValues.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState(initialValues.faviconUrl);
  const [timeZone, setTimeZone] = useState(initialValues.timeZone);
  const [dateFormat, setDateFormat] = useState<PlatformDateFormat>(initialValues.dateFormat as PlatformDateFormat);
  const [timeFormat, setTimeFormat] = useState<PlatformTimeFormat>(initialValues.timeFormat as PlatformTimeFormat);
  const previewDateTime = useMemo(
    () =>
      formatPlatformPreviewDateTime(new Date("2026-04-22T15:45:00.000Z"), {
        timeZone,
        dateFormat,
        timeFormat,
      }),
    [dateFormat, timeFormat, timeZone]
  );

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form action={formAction} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Настройки - Общие</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Название платформы, описание, контакты поддержки и бренд-ассеты будут использоваться в интерфейсе и на экране входа.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="siteName" className="block text-sm font-medium text-zinc-900">
              Название сайта
            </label>
            <input
              id="siteName"
              name="siteName"
              value={siteName}
              onChange={(event) => setSiteName(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="siteDescription" className="block text-sm font-medium text-zinc-900">
              Короткое описание
            </label>
            <textarea
              id="siteDescription"
              name="siteDescription"
              value={siteDescription}
              onChange={(event) => setSiteDescription(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="supportEmail" className="block text-sm font-medium text-zinc-900">
              Email поддержки
            </label>
            <input
              id="supportEmail"
              name="supportEmail"
              type="email"
              value={supportEmail}
              onChange={(event) => setSupportEmail(event.target.value)}
              placeholder="support@company.ru"
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
            <div className="space-y-4">
              <label className="flex items-start gap-3">
                <input
                  name="feedbackEnabled"
                  type="checkbox"
                  checked={feedbackEnabled}
                  onChange={(event) => setFeedbackEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-500"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">Включить отзывы о курсах</span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Если выключить отзывы, они исчезнут из портала и каталога, но сохранятся в базе и вернутся после повторного включения.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  name="feedbackModerationEnabled"
                  type="checkbox"
                  checked={feedbackModerationEnabled}
                  onChange={(event) => setFeedbackModerationEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-500"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">Модерировать отзывы перед публикацией</span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Если включено, новые отзывы учеников сначала попадут в статус «На модерации» и будут опубликованы после подтверждения в карточке курса.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="timeZone" className="block text-sm font-medium text-zinc-900">
                Часовой пояс
              </label>
              <select
                id="timeZone"
                name="timeZone"
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
              >
                {PLATFORM_TIME_ZONES.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="dateFormat" className="block text-sm font-medium text-zinc-900">
                Формат даты
              </label>
              <select
                id="dateFormat"
                name="dateFormat"
                value={dateFormat}
                onChange={(event) => setDateFormat(event.target.value as PlatformDateFormat)}
                className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
              >
                {PLATFORM_DATE_FORMATS.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="timeFormat" className="block text-sm font-medium text-zinc-900">
                Формат времени
              </label>
              <select
                id="timeFormat"
                name="timeFormat"
                value={timeFormat}
                onChange={(event) => setTimeFormat(event.target.value as PlatformTimeFormat)}
                className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
              >
                {PLATFORM_TIME_FORMATS.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <BrandAssetInput
            name="logoUrl"
            label="Логотип"
            initialValue={initialValues.logoUrl || null}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hint="Загрузите логотип в PNG, JPG, WEBP или SVG."
            onValueChange={setLogoUrl}
          />

          <BrandAssetInput
            name="faviconUrl"
            label="Favicon"
            initialValue={initialValues.faviconUrl || null}
            accept=".ico,image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
            hint="Загрузите иконку вкладки в PNG, SVG или ICO."
            onValueChange={setFaviconUrl}
          />

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-900">
              Подтвердите текущим паролем
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Перед сохранением подтвердите изменение общих настроек паролем администратора.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-6 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Сохраняем..." : "Сохранить общие настройки"}
        </button>
      </form>

      <aside className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Предпросмотр</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Посмотрите, как обновлённые общие настройки будут выглядеть до сохранения.
        </p>

        <div className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={siteName || "Логотип"} className="h-10 w-auto max-w-[140px] object-contain" />
            ) : (
              <div className="text-lg font-semibold text-zinc-900">{siteName || "Название платформы"}</div>
            )}
            {faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded-lg border border-zinc-200 bg-white object-contain p-1" />
            ) : null}
          </div>

          <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">{siteName || "Название платформы"}</p>
          <h3 className="mt-2 text-xl font-semibold text-zinc-950">Вход в систему</h3>
          <p className="mt-3 text-sm text-zinc-600">
            {siteDescription || "Короткое описание платформы появится здесь."}
          </p>

          {supportEmail ? (
            <p className="mt-5 text-sm text-zinc-500">Поддержка: {supportEmail}</p>
          ) : (
            <p className="mt-5 text-sm text-zinc-400">Email поддержки пока не задан.</p>
          )}

          <p className="mt-3 text-sm text-zinc-500">
            Отзывы:{" "}
            {feedbackEnabled
              ? feedbackModerationEnabled
                ? "включены, с премодерацией"
                : "включены, публикуются сразу"
              : "выключены и скрыты из курсов"}
          </p>
        </div>

        <div className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="text-sm font-semibold text-zinc-950">Пример даты и времени</h3>
          <p className="mt-2 text-sm text-zinc-600">{previewDateTime}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Часовой пояс: {timeZone}. Форматы: {dateFormat} и {timeFormat}.
          </p>
        </div>

        <div className="mt-5 space-y-3 text-sm text-zinc-600">
          <p>Название и описание используются в metadata и на экране входа.</p>
          <p>Логотип и favicon применяются к интерфейсу платформы и вкладке браузера.</p>
          <p>Отзывы помогают ученикам выбирать курс, а администраторам - улучшать материалы.</p>
          <p>Премодерация отзывов позволяет сначала проверить новую обратную связь по курсам.</p>
          <p>Настройки даты и времени готовы для использования в общесистемных форматтерах.</p>
        </div>
      </aside>
    </section>
  );
}

export function GeneralPlatformSettingsForm({ action, settings }: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_GENERAL_PLATFORM_SETTINGS_FORM_STATE);
  const initialValues = state.values ?? getInitialValues(settings);

  return (
    <GeneralPlatformSettingsFormBody
      key={JSON.stringify(initialValues)}
      error={state.error}
      formAction={formAction}
      initialValues={initialValues}
      pending={pending}
    />
  );
}

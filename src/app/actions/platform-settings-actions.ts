"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  GeneralPlatformSettingsFormState,
  GeneralPlatformSettingsFormValues,
} from "@/app/admin/settings/general-platform-settings-form-state";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { pruneExpiredAuditLogEvents, recordAuditEvent } from "@/lib/audit-log";
import {
  isPlatformDateFormat,
  isPlatformTimeFormat,
  isSupportedPlatformTimeZone,
} from "@/lib/platform-localization";
import { saveEmailPlatformSettingsFromForm } from "@/lib/platform-email-settings-save";
import prisma from "@/lib/prisma";
import { DEFAULT_PLATFORM_SETTINGS, pruneExpiredLoginEvents } from "@/lib/platform-settings";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asNullableString(formData: FormData, key: string) {
  const value = asString(formData, key);
  return value || null;
}

function asChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAssetUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/branding/")) return value;
  throw new Error("Допустимы только загруженные бренд-ассеты.");
}

function parseIntegerInRange(value: string, label: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} должно быть целым числом от ${min} до ${max}.`);
  }
  return parsed;
}

function revalidatePlatformSettings() {
  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/maintenance");
  revalidatePath("/courses");
  revalidatePath("/admin/settings");
}

export async function saveGeneralPlatformSettings(
  _prevState: GeneralPlatformSettingsFormState,
  formData: FormData
): Promise<GeneralPlatformSettingsFormState> {
  const session = await requirePlatformAdmin();

  const siteName = asString(formData, "siteName");
  const siteDescription = asString(formData, "siteDescription");
  const supportEmailValue = asString(formData, "supportEmail");
  const supportEmail = supportEmailValue || null;
  const feedbackEnabled = asChecked(formData, "feedbackEnabled");
  const feedbackModerationEnabled = asChecked(formData, "feedbackModerationEnabled");
  const logoUrlValue = asString(formData, "logoUrl");
  const faviconUrlValue = asString(formData, "faviconUrl");
  const timeZone = asString(formData, "timeZone") || DEFAULT_PLATFORM_SETTINGS.timeZone;
  const dateFormat = asString(formData, "dateFormat") || DEFAULT_PLATFORM_SETTINGS.dateFormat;
  const timeFormat = asString(formData, "timeFormat") || DEFAULT_PLATFORM_SETTINGS.timeFormat;
  const confirmPassword = asString(formData, "confirmPassword");
  const values: GeneralPlatformSettingsFormValues = {
    siteName,
    siteDescription,
    supportEmail: supportEmailValue,
    feedbackEnabled,
    feedbackModerationEnabled,
    logoUrl: logoUrlValue,
    faviconUrl: faviconUrlValue,
    timeZone,
    dateFormat,
    timeFormat,
  };
  const withError = (error: string): GeneralPlatformSettingsFormState => ({ error, values });

  if (!siteName) {
    return withError("Название платформы обязательно.");
  }

  if (!siteDescription) {
    return withError("Краткое описание обязательно.");
  }

  if (supportEmail && !isValidEmail(supportEmail)) {
    return withError("Укажите корректный email поддержки.");
  }

  if (!isSupportedPlatformTimeZone(timeZone)) {
    return withError("Выберите корректный часовой пояс.");
  }

  if (!isPlatformDateFormat(dateFormat)) {
    return withError("Выберите корректный формат даты.");
  }

  if (!isPlatformTimeFormat(timeFormat)) {
    return withError("Выберите корректный формат времени.");
  }

  if (!confirmPassword) {
    return withError("Введите текущий пароль администратора для подтверждения.");
  }

  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;
  try {
    logoUrl = normalizeAssetUrl(logoUrlValue || null);
    faviconUrl = normalizeAssetUrl(faviconUrlValue || null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Проверьте загруженные бренд-ассеты.";
    return withError(message);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      login: true,
      name: true,
      passwordHash: true,
    },
  });

  if (!currentUser) {
    return withError("Не удалось подтвердить текущего администратора.");
  }

  if (!currentUser.passwordHash) {
    return withError("Для подтверждения нужен аккаунт с установленным паролем.");
  }

  const passwordMatches = await bcrypt.compare(confirmPassword, currentUser.passwordHash);
  if (!passwordMatches) {
    return withError("Неверный пароль подтверждения.");
  }

  await prisma.platformSettings.upsert({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    create: {
      id: DEFAULT_PLATFORM_SETTINGS.id,
      siteName,
      siteDescription,
      supportEmail,
      feedbackEnabled,
      feedbackModerationEnabled,
      logoUrl,
      faviconUrl,
      timeZone,
      dateFormat,
      timeFormat,
    },
    update: {
      siteName,
      siteDescription,
      supportEmail,
      feedbackEnabled,
      feedbackModerationEnabled,
      logoUrl,
      faviconUrl,
      timeZone,
      dateFormat,
      timeFormat,
    },
  });

  await recordAuditEvent({
    actor: {
      id: session.user.id,
      login: session.user.email,
      name: session.user.name,
    },
    action: "platform_settings:update_general",
    objectType: "platform_settings",
    objectId: DEFAULT_PLATFORM_SETTINGS.id,
    objectLabel: siteName,
    metadata: {
      siteName,
      supportEmail,
      feedbackEnabled,
      feedbackModerationEnabled,
      hasLogo: Boolean(logoUrl),
      hasFavicon: Boolean(faviconUrl),
      timeZone,
      dateFormat,
      timeFormat,
    },
  });

  revalidatePlatformSettings();
  redirect("/admin/settings?tab=general&saved=general");
}

export async function saveEmailPlatformSettings(formData: FormData) {
  const session = await requirePlatformAdmin();

  try {
    await saveEmailPlatformSettingsFromForm(formData, {
      id: session.user.id,
      login: session.user.email,
      name: session.user.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить email-настройки.";
    redirect("/admin/settings?tab=email&error=" + encodeURIComponent(message));
  }

  redirect("/admin/settings?tab=email&saved=email");
}

export async function saveSecurityPlatformSettings(formData: FormData) {
  const session = await requirePlatformAdmin();

  let passwordMinLength: number = DEFAULT_PLATFORM_SETTINGS.passwordMinLength;
  let sessionMaxAgeMinutes: number = DEFAULT_PLATFORM_SETTINGS.sessionMaxAgeMinutes;
  let sessionIdleTimeoutMinutes: number = DEFAULT_PLATFORM_SETTINGS.sessionIdleTimeoutMinutes;
  let maxFailedLoginAttempts: number = DEFAULT_PLATFORM_SETTINGS.maxFailedLoginAttempts;
  let loginLockoutMinutes: number = DEFAULT_PLATFORM_SETTINGS.loginLockoutMinutes;
  let loginEventRetentionDays: number = DEFAULT_PLATFORM_SETTINGS.loginEventRetentionDays;
  let auditLogRetentionDays: number = DEFAULT_PLATFORM_SETTINGS.auditLogRetentionDays;
  let userActivationInviteTtlDays: number = DEFAULT_PLATFORM_SETTINGS.userActivationInviteTtlDays;
  let courseInviteTtlDays: number = DEFAULT_PLATFORM_SETTINGS.courseInviteTtlDays;

  try {
    passwordMinLength = parseIntegerInRange(
      asString(formData, "passwordMinLength"),
      "Минимальная длина пароля",
      8,
      16
    );
    sessionMaxAgeMinutes = parseIntegerInRange(
      asString(formData, "sessionMaxAgeMinutes"),
      "Время жизни сессии",
      15,
      43200
    );
    sessionIdleTimeoutMinutes = parseIntegerInRange(
      asString(formData, "sessionIdleTimeoutMinutes"),
      "Таймаут бездействия",
      0,
      1440
    );
    maxFailedLoginAttempts = parseIntegerInRange(
      asString(formData, "maxFailedLoginAttempts"),
      "Лимит неудачных попыток входа",
      1,
      20
    );
    loginLockoutMinutes = parseIntegerInRange(
      asString(formData, "loginLockoutMinutes"),
      "Время временной блокировки",
      1,
      1440
    );
    loginEventRetentionDays = parseIntegerInRange(
      asString(formData, "loginEventRetentionDays"),
      "Срок хранения логов входа",
      90,
      3650
    );
    auditLogRetentionDays = parseIntegerInRange(
      asString(formData, "auditLogRetentionDays"),
      "Срок хранения аудит-лога",
      90,
      3650
    );
    userActivationInviteTtlDays = parseIntegerInRange(
      asString(formData, "userActivationInviteTtlDays"),
      "Срок жизни ссылки активации пользователя",
      1,
      365
    );
    courseInviteTtlDays = parseIntegerInRange(
      asString(formData, "courseInviteTtlDays"),
      "Срок жизни приглашения на курс",
      1,
      365
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Проверьте параметры безопасности.";
    redirect("/admin/settings?tab=security&error=" + encodeURIComponent(message));
  }

  const passwordRequireNumber = asChecked(formData, "passwordRequireNumber");
  const passwordRequireUppercase = asChecked(formData, "passwordRequireUppercase");
  const passwordRequireSpecialChar = asChecked(formData, "passwordRequireSpecialChar");
  const adminTotpRequired = asChecked(formData, "adminTotpRequired");

  await prisma.platformSettings.upsert({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    create: {
      id: DEFAULT_PLATFORM_SETTINGS.id,
      passwordMinLength,
      passwordRequireNumber,
      passwordRequireUppercase,
      passwordRequireSpecialChar,
      sessionMaxAgeMinutes,
      sessionIdleTimeoutMinutes,
      maxFailedLoginAttempts,
      loginLockoutMinutes,
      loginEventRetentionDays,
      auditLogRetentionDays,
      adminTotpRequired,
      userActivationInviteTtlDays,
      courseInviteTtlDays,
    },
    update: {
      passwordMinLength,
      passwordRequireNumber,
      passwordRequireUppercase,
      passwordRequireSpecialChar,
      sessionMaxAgeMinutes,
      sessionIdleTimeoutMinutes,
      maxFailedLoginAttempts,
      loginLockoutMinutes,
      loginEventRetentionDays,
      auditLogRetentionDays,
      adminTotpRequired,
      userActivationInviteTtlDays,
      courseInviteTtlDays,
    },
  });

  await pruneExpiredLoginEvents(loginEventRetentionDays);
  await pruneExpiredAuditLogEvents(auditLogRetentionDays);

  await recordAuditEvent({
    actor: {
      id: session.user.id,
      login: session.user.email,
      name: session.user.name,
    },
    action: "platform_settings:update_security",
    objectType: "platform_settings",
    objectId: DEFAULT_PLATFORM_SETTINGS.id,
    objectLabel: "Security policies",
    metadata: {
      passwordMinLength,
      passwordRequireNumber,
      passwordRequireUppercase,
      passwordRequireSpecialChar,
      sessionMaxAgeMinutes,
      sessionIdleTimeoutMinutes,
      maxFailedLoginAttempts,
      loginLockoutMinutes,
      loginEventRetentionDays,
      auditLogRetentionDays,
      adminTotpRequired,
      userActivationInviteTtlDays,
      courseInviteTtlDays,
    },
  });

  revalidatePlatformSettings();
  redirect("/admin/settings?tab=security&saved=security");
}

export async function saveMaintenancePlatformSettings(formData: FormData) {
  const session = await requirePlatformAdmin();

  const maintenanceMode = asChecked(formData, "maintenanceMode");
  const maintenanceMessage = asNullableString(formData, "maintenanceMessage");

  await prisma.platformSettings.upsert({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    create: {
      id: DEFAULT_PLATFORM_SETTINGS.id,
      maintenanceMode,
      maintenanceMessage,
    },
    update: {
      maintenanceMode,
      maintenanceMessage,
    },
  });

  await recordAuditEvent({
    actor: {
      id: session.user.id,
      login: session.user.email,
      name: session.user.name,
    },
    action: "platform_settings:update_maintenance",
    objectType: "platform_settings",
    objectId: DEFAULT_PLATFORM_SETTINGS.id,
    objectLabel: maintenanceMode ? "Maintenance enabled" : "Maintenance disabled",
    metadata: {
      maintenanceMode,
      maintenanceMessage,
    },
  });

  revalidatePlatformSettings();
  redirect("/admin/settings?tab=security&saved=maintenance");
}

export async function saveReminderPlatformSettings(formData: FormData) {
  const session = await requirePlatformAdmin();

  let courseReminderExpiringDays: number = DEFAULT_PLATFORM_SETTINGS.courseReminderExpiringDays;
  try {
    courseReminderExpiringDays = parseIntegerInRange(
      asString(formData, "courseReminderExpiringDays"),
      "Порог скорого окончания доступа",
      1,
      60
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Проверьте настройки напоминаний.";
    redirect("/admin/settings?tab=reminders&error=" + encodeURIComponent(message));
  }

  const courseRemindersEnabled = asChecked(formData, "courseRemindersEnabled");
  const courseReminderNotStartedEnabled = asChecked(formData, "courseReminderNotStartedEnabled");
  const courseReminderExpiringEnabled = asChecked(formData, "courseReminderExpiringEnabled");
  const courseReminderExpiredEnabled = asChecked(formData, "courseReminderExpiredEnabled");
  const courseReminderQuizFailedEnabled = asChecked(formData, "courseReminderQuizFailedEnabled");

  await prisma.platformSettings.upsert({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    create: {
      id: DEFAULT_PLATFORM_SETTINGS.id,
      courseRemindersEnabled,
      courseReminderNotStartedEnabled,
      courseReminderExpiringEnabled,
      courseReminderExpiredEnabled,
      courseReminderQuizFailedEnabled,
      courseReminderExpiringDays,
    },
    update: {
      courseRemindersEnabled,
      courseReminderNotStartedEnabled,
      courseReminderExpiringEnabled,
      courseReminderExpiredEnabled,
      courseReminderQuizFailedEnabled,
      courseReminderExpiringDays,
    },
  });

  await recordAuditEvent({
    actor: {
      id: session.user.id,
      login: session.user.email,
      name: session.user.name,
    },
    action: "platform_settings:update_reminders",
    objectType: "platform_settings",
    objectId: DEFAULT_PLATFORM_SETTINGS.id,
    objectLabel: "Course reminders",
    metadata: {
      courseRemindersEnabled,
      courseReminderNotStartedEnabled,
      courseReminderExpiringEnabled,
      courseReminderExpiredEnabled,
      courseReminderQuizFailedEnabled,
      courseReminderExpiringDays,
    },
  });

  revalidatePlatformSettings();
  redirect("/admin/settings?tab=reminders&saved=reminders");
}

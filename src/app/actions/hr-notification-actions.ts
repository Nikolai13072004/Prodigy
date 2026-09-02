"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import { queueHrNotificationEmailsForUser } from "@/lib/hr-notifications";
import { PERMISSIONS } from "@/lib/roles";
import { hrNotifications } from "@/modules/hr-reporting/server/hr-notifications";

function asBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function asInt(formData: FormData, key: string, fallback: number) {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), 180);
}

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function saveHrNotificationPreferences(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const returnTo = safeReturnPath(formData.get("returnTo")?.toString());

  await hrNotifications.savePreferences(session.user.id, {
    notifyCourseCompleted: asBoolean(formData, "notifyCourseCompleted"),
    notifyLowActivity: asBoolean(formData, "notifyLowActivity"),
    lowActivityDays: asInt(formData, "lowActivityDays", 7),
    notifyAccessExpiring: asBoolean(formData, "notifyAccessExpiring"),
    accessExpiringDays: asInt(formData, "accessExpiringDays", 7),
  });

  revalidatePath("/");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/notifications");
  redirect(appendParams(returnTo || "/admin/reports/notifications", { notificationsSaved: "1" }));
}

export async function queueMyHrNotificationEmails(formData?: FormData) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const returnTo = safeReturnPath(formData?.get("returnTo")?.toString());
  const result = await queueHrNotificationEmailsForUser(session.user.id);

  const params = new URLSearchParams();
  params.set("notificationEmailStatus", result.reason);
  if (result.queuedCount > 0) {
    params.set("notificationEmailCount", String(result.queuedCount));
  }

  revalidatePath("/");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/notifications");
  const fallbackPath = "/admin/reports/notifications";
  const nextPath = returnTo || fallbackPath;
  redirect(appendParams(nextPath, Object.fromEntries(params.entries())));
}

export async function dismissHrNotification(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const notificationKey = asString(formData, "notificationKey");
  const type = asString(formData, "type");
  const courseId = asString(formData, "courseId");
  const learnerId = asString(formData, "learnerId");
  const returnTo = safeReturnPath(asString(formData, "returnTo"));

  if (!notificationKey || !type || !courseId || !learnerId) {
    redirect(returnTo);
  }

  await hrNotifications.dismiss(session.user.id, {
    notificationKey,
    type,
    courseId,
    learnerId,
  });

  revalidatePath("/");
  redirect(returnTo);
}

function appendParams(path: string, params: Record<string, string>) {
  const [pathname, hash = ""] = path.split("#", 2);
  const [basePath, existingQuery = ""] = pathname.split("?", 2);
  const search = new URLSearchParams(existingQuery);

  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });

  const query = search.toString();
  const suffix = hash ? `#${hash}` : "";
  return query ? `${basePath}?${query}${suffix}` : `${basePath}${suffix}`;
}

export async function restoreHrNotification(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const notificationKey = asString(formData, "notificationKey");
  const returnTo = safeReturnPath(asString(formData, "returnTo"));

  if (notificationKey) {
    await hrNotifications.restore(session.user.id, notificationKey);
  }

  revalidatePath("/");
  redirect(returnTo);
}

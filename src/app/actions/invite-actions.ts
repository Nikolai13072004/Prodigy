"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getPlatformSecuritySettings } from "@/lib/platform-settings";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { AcceptCourseInviteError } from "@/modules/enrollment/application/accept-course-invite-errors";
import { courseInvites } from "@/modules/enrollment/server/accept-course-invite";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function invitePageUrl(token: string, params?: Record<string, string | undefined>) {
  const base = `/invite/${token}`;
  if (!params) return base;

  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });

  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function courseUrl(courseId: string) {
  return `/courses/${courseId}`;
}

function inviteError(token: string, message: string): never {
  redirect(invitePageUrl(token, { error: message }));
}

function revalidateInviteAccepted(courseId: string, createdUser: boolean) {
  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath("/analytics");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/learners`);
  revalidatePath(`/courses/${courseId}/results`);
  revalidatePath(`/courses/${courseId}/manage`);
  if (createdUser) revalidatePath("/admin/users-groups");
}

export async function acceptCourseInvite(formData: FormData) {
  await ensureSystemRoleProfiles();
  const securitySettings = await getPlatformSecuritySettings();

  const token = asString(formData, "token");
  const name = asString(formData, "name");
  const login = asString(formData, "login").toLowerCase();
  const password = asString(formData, "password");

  if (!token) redirect("/login");
  if (!name) inviteError(token, "Укажите имя и фамилию.");
  if (!login) inviteError(token, "Укажите логин.");
  if (!password) inviteError(token, "Укажите пароль.");

  let result;
  try {
    result = await courseInvites.accept({ token, name, login, password, securitySettings });
  } catch (error) {
    if (error instanceof AcceptCourseInviteError) inviteError(token, error.message);
    throw error;
  }

  revalidateInviteAccepted(result.courseId, result.createdUser);
  await signIn("credentials", {
    login,
    password,
    redirectTo: courseUrl(result.courseId),
  });
}

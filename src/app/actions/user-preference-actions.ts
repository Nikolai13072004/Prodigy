"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guards";
import { uiPreferences } from "@/modules/user/server/ui-preferences";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeCoursesReturnTo(raw: string) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || !raw.startsWith("/courses")) {
    return "/courses";
  }

  return raw;
}

export async function saveAdminCoursesViewPreference(formData: FormData) {
  const session = await requireSession();
  const returnTo = safeCoursesReturnTo(asString(formData, "returnTo"));

  await uiPreferences.setAdminCoursesView({
    userId: session.user.id,
    view: asString(formData, "view"),
  });

  revalidatePath("/courses");
  redirect(returnTo);
}

export async function savePreferredRolePreference(preferredRole: string) {
  const session = await requireSession();
  const availableRoles = session.user.roles?.length
    ? session.user.roles
    : [session.user.role];

  await uiPreferences.setPreferredRole({
    userId: session.user.id,
    role: preferredRole,
    availableRoles,
  });

  revalidatePath("/", "layout");
  revalidatePath("/courses");
}

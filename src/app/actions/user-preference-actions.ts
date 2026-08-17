"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";

type AdminCourseView = "cards" | "list" | "table";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getAdminCoursesViewParam(value: string): AdminCourseView {
  if (value === "cards" || value === "list") return value;
  return "table";
}

function safeCoursesReturnTo(raw: string) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || !raw.startsWith("/courses")) {
    return "/courses";
  }

  return raw;
}

export async function saveAdminCoursesViewPreference(formData: FormData) {
  const session = await requireSession();
  const view = getAdminCoursesViewParam(asString(formData, "view"));
  const returnTo = safeCoursesReturnTo(asString(formData, "returnTo"));

  await prisma.userUiPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      adminCoursesView: view,
    },
    update: {
      adminCoursesView: view,
    },
  });

  revalidatePath("/courses");
  redirect(returnTo);
}

export async function savePreferredRolePreference(preferredRole: string) {
  const session = await requireSession();
  const role = preferredRole.trim();
  const availableRoles = new Set(session.user.roles?.length ? session.user.roles : [session.user.role]);

  if (!role || !availableRoles.has(role)) {
    throw new Error("Выбранная роль недоступна пользователю.");
  }

  await prisma.userUiPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      preferredRole: role,
    },
    update: {
      preferredRole: role,
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/courses");
}

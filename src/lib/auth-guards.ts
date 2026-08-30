import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { canManageCourse } from "@/lib/access";
import { getPermissionsForRoleNames } from "@/lib/role-profiles";
import { type Permission, PERMISSIONS, hasPermission, isPlatformAdminRole } from "@/lib/roles";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const currentPermissions = await getPermissionsForRoleNames(session.user.roles);
  session.user.permissions = currentPermissions;

  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!hasPermission(session.user.roles, PERMISSIONS.COURSES_CREATE_EDIT, session.user.permissions)) redirect("/");
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireSession();
  if (!hasPermission(session.user.roles, permission, session.user.permissions)) redirect("/");
  return session;
}

export async function requirePlatformAdmin() {
  const session = await requireSession();
  if (!isPlatformAdminRole(session.user.roles)) redirect("/");
  return session;
}

export async function requireManageCourse(courseId: string) {
  const session = await requireSession();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, ownerId: true },
  });
  if (!course) notFound();
  if (!canManageCourse(session.user.roles, session.user.id, course)) redirect("/");
  return session;
}

export async function requirePublishCourse(courseId: string) {
  const session = await requireSession();
  if (!hasPermission(session.user.roles, PERMISSIONS.COURSES_PUBLISH, session.user.permissions)) {
    redirect("/");
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, ownerId: true },
  });
  if (!course) notFound();
  if (!canManageCourse(session.user.roles, session.user.id, course)) redirect("/");
  return session;
}

export async function requireCourseWorkspaceAccess(courseId: string) {
  const session = await requireSession();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, ownerId: true },
  });
  if (!course) notFound();

  const canEditCourse =
    hasPermission(session.user.roles, PERMISSIONS.COURSES_CREATE_EDIT, session.user.permissions) &&
    canManageCourse(session.user.roles, session.user.id, course);
  const canPublishCourse =
    hasPermission(session.user.roles, PERMISSIONS.COURSES_PUBLISH, session.user.permissions) &&
    canManageCourse(session.user.roles, session.user.id, course);
  const canManageAssignments = hasPermission(
    session.user.roles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    session.user.permissions
  );

  if (!canEditCourse && !canPublishCourse && !canManageAssignments) redirect("/");

  return {
    session,
    course,
    canEditCourse,
    canPublishCourse,
    canManageAssignments,
  };
}

import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { mergeCourseAccessExpiry } from "@/lib/course-access-window";
import { hashCourseInviteToken } from "@/lib/course-invites";
import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";
import type {
  AcceptExistingUserInput,
  CourseInviteRepository,
  CreateUserAndAcceptInput,
} from "../application/accept-course-invite-ports";

export const prismaCourseInviteRepository: CourseInviteRepository = {
  async findInviteByToken(token) {
    const invite = await prisma.courseInvite.findUnique({
      where: { tokenHash: hashCourseInviteToken(token) },
      include: { course: { select: { id: true, title: true } } },
    });
    if (!invite) return null;
    return {
      id: invite.id,
      courseId: invite.courseId,
      email: invite.email,
      status: invite.status,
      expiresAt: invite.expiresAt,
      accessExpiresAt: invite.accessExpiresAt,
      course: { id: invite.course.id, title: invite.course.title },
    };
  },

  async markInviteExpired(inviteId) {
    await prisma.courseInvite
      .update({ where: { id: inviteId }, data: { status: "EXPIRED" } })
      .catch(() => undefined);
  },

  async findStudentRoleProfileId() {
    const profile = await prisma.roleProfile.findUnique({
      where: { name: STANDARD_ROLE_NAMES.STUDENT },
      select: { id: true },
    });
    return profile?.id ?? null;
  },

  async findUserByEmail(email) {
    const user = await prisma.user.findFirst({
      where: { email },
      include: {
        userRoles: { include: { roleProfile: { select: { name: true } } } },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      status: user.status,
      login: user.login,
      role: user.role,
      userRoles: user.userRoles.map((item) => ({
        roleProfile: { name: item.roleProfile.name },
      })),
    };
  },

  async findUserIdByLogin(login) {
    const user = await prisma.user.findUnique({
      where: { login },
      select: { id: true },
    });
    return user?.id ?? null;
  },

  async acceptForExistingUser(input: AcceptExistingUserInput) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.courseUserAssignment.findUnique({
        where: {
          courseId_userId: { courseId: input.courseId, userId: input.userId },
        },
        select: { expiresAt: true },
      });

      await tx.courseUserAssignment.upsert({
        where: {
          courseId_userId: { courseId: input.courseId, userId: input.userId },
        },
        create: {
          courseId: input.courseId,
          userId: input.userId,
          expiresAt: input.accessExpiresAt,
        },
        update: {
          expiresAt: mergeCourseAccessExpiry(current?.expiresAt, input.accessExpiresAt),
        },
      });

      await tx.courseInvite.update({
        where: { id: input.inviteId },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedUserId: input.userId,
        },
      });
    });
  },

  async createUserAndAccept(input: CreateUserAndAcceptInput) {
    await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: input.name,
          login: input.login,
          email: input.email,
          passwordHash: input.passwordHash,
          role: STANDARD_ROLE_NAMES.STUDENT,
          status: USER_STATUSES.ACTIVE,
          userRoles: { create: { roleProfileId: input.studentRoleProfileId } },
        },
      });

      await tx.courseUserAssignment.upsert({
        where: {
          courseId_userId: { courseId: input.courseId, userId: createdUser.id },
        },
        create: {
          courseId: input.courseId,
          userId: createdUser.id,
          expiresAt: input.accessExpiresAt,
        },
        update: {
          expiresAt: mergeCourseAccessExpiry(undefined, input.accessExpiresAt),
        },
      });

      await tx.courseInvite.update({
        where: { id: input.inviteId },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedUserId: createdUser.id,
        },
      });
    });
  },

  isUniqueViolation(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  },
};

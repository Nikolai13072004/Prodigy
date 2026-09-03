import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { createCourseInviteToken } from "@/lib/course-invites";
import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { prismaCourseInviteRepository as repo } from "./prisma-course-invite-repository";

// Инфра-тест репозитория приглашений на курс. Запуск: npm run test:infra.
// Все seed-id с префиксом ci- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function ensureStudentRole() {
  await prisma.roleProfile.upsert({
    where: { name: STANDARD_ROLE_NAMES.STUDENT },
    update: {},
    create: { name: STANDARD_ROLE_NAMES.STUDENT, permissionsJson: "[]", isSystem: true },
  });
}

async function seedCourse(id: string) {
  return prisma.course.create({ data: { id, title: `Course ${id}`, status: "PUBLISHED" } });
}

async function seedInvite(opts: { id: string; courseId: string; email: string; status?: string; expiresAt?: Date }) {
  const { token, tokenHash } = createCourseInviteToken();
  await prisma.courseInvite.create({
    data: {
      id: opts.id,
      courseId: opts.courseId,
      email: opts.email,
      tokenHash,
      status: opts.status ?? "PENDING",
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60_000),
    },
  });
  return token;
}

test("findInviteByToken: находит по сырому токену, null для чужого", async () => {
  const course = await seedCourse("ci-c1");
  const token = await seedInvite({ id: "ci-inv1", courseId: course.id, email: "ci-1@example.com" });
  const found = await repo.findInviteByToken(token);
  assert.equal(found?.id, "ci-inv1");
  assert.equal(found?.course.title, "Course ci-c1");
  assert.equal(await repo.findInviteByToken("no-such-token"), null);
});

test("findStudentRoleProfileId: возвращает id системной роли", async () => {
  await ensureStudentRole();
  const id = await repo.findStudentRoleProfileId();
  assert.ok(id);
});

test("createUserAndAccept: создаёт ученика, назначение и помечает ACCEPTED", async () => {
  await ensureStudentRole();
  const roleId = (await repo.findStudentRoleProfileId())!;
  const course = await seedCourse("ci-c2");
  await seedInvite({ id: "ci-inv2", courseId: course.id, email: "ci-2@example.com" });

  await repo.createUserAndAccept({
    inviteId: "ci-inv2",
    courseId: course.id,
    name: "Новый Ученик",
    login: "ci-login-2",
    email: "ci-2@example.com",
    passwordHash: "x",
    studentRoleProfileId: roleId,
    accessExpiresAt: null,
  });

  const user = await prisma.user.findUnique({ where: { login: "ci-login-2" }, select: { id: true, status: true } });
  assert.ok(user);
  assert.equal(user!.status, "ACTIVE");
  const assignment = await prisma.courseUserAssignment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user!.id } },
  });
  assert.ok(assignment);
  const invite = await prisma.courseInvite.findUnique({ where: { id: "ci-inv2" } });
  assert.equal(invite?.status, "ACCEPTED");
  assert.equal(invite?.acceptedUserId, user!.id);
});

test("acceptForExistingUser: upsert назначения + ACCEPTED без создания пользователя", async () => {
  const course = await seedCourse("ci-c3");
  await seedInvite({ id: "ci-inv3", courseId: course.id, email: "ci-3@example.com" });
  const user = await prisma.user.create({
    data: { id: "ci-u3", login: "ci-login-3", name: "Существующий", email: "ci-3@example.com", passwordHash: "x" },
  });

  await repo.acceptForExistingUser({
    inviteId: "ci-inv3",
    courseId: course.id,
    userId: user.id,
    accessExpiresAt: null,
  });

  const assignment = await prisma.courseUserAssignment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
  });
  assert.ok(assignment);
  const invite = await prisma.courseInvite.findUnique({ where: { id: "ci-inv3" } });
  assert.equal(invite?.status, "ACCEPTED");
  assert.equal(invite?.acceptedUserId, user.id);
});

test("markInviteExpired: переводит инвайт в EXPIRED", async () => {
  const course = await seedCourse("ci-c4");
  await seedInvite({
    id: "ci-inv4",
    courseId: course.id,
    email: "ci-4@example.com",
    expiresAt: new Date(Date.now() - 60_000),
  });
  await repo.markInviteExpired("ci-inv4");
  const invite = await prisma.courseInvite.findUnique({ where: { id: "ci-inv4" } });
  assert.equal(invite?.status, "EXPIRED");
});

test("findUserByEmail / findUserIdByLogin", async () => {
  const user = await prisma.user.create({
    data: { id: "ci-u5", login: "ci-login-5", name: "U5", email: "ci-5@example.com", passwordHash: "x" },
  });
  const byEmail = await repo.findUserByEmail("ci-5@example.com");
  assert.equal(byEmail?.id, user.id);
  assert.equal(await repo.findUserIdByLogin("ci-login-5"), user.id);
  assert.equal(await repo.findUserIdByLogin("ci-nope"), null);
});

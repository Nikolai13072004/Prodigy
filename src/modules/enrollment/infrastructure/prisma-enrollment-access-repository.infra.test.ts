import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaEnrollmentAccessRepository as repo } from "./prisma-enrollment-access-repository";

// Инфра-тест репозитория доступа к курсу против настоящей (временной) БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x" },
  });
}

function seedCourse(id: string) {
  return prisma.course.create({ data: { id, title: `Course ${id}` } });
}

test("findAssignments: прямое назначение → попадает в directExpiries", async () => {
  await seedUser("u-eac-1");
  await seedCourse("c-eac-1");
  const expiresAt = new Date("2030-01-01T00:00:00.000Z");
  await prisma.courseUserAssignment.create({
    data: { courseId: "c-eac-1", userId: "u-eac-1", assignedById: "u-eac-1", expiresAt },
  });

  const result = await repo.findAssignments("c-eac-1", "u-eac-1");
  assert.deepEqual(result.directExpiries, [expiresAt]);
  assert.deepEqual(result.groupExpiries, []);
});

test("findAssignments: назначение через членство в группе → попадает в groupExpiries", async () => {
  await seedUser("u-eac-2");
  await seedCourse("c-eac-2");
  await prisma.group.create({ data: { id: "g-eac-2", name: "Group g-eac-2" } });
  await prisma.groupMembership.create({
    data: { groupId: "g-eac-2", userId: "u-eac-2" },
  });
  await prisma.courseGroupAssignment.create({
    data: { courseId: "c-eac-2", groupId: "g-eac-2", assignedById: "u-eac-2", expiresAt: null },
  });

  const result = await repo.findAssignments("c-eac-2", "u-eac-2");
  assert.deepEqual(result.groupExpiries, [null]);
  assert.deepEqual(result.directExpiries, []);
});

test("findAssignments: групповое назначение без членства пользователя не учитывается", async () => {
  await seedUser("u-eac-3");
  await seedCourse("c-eac-3");
  // Группа с назначением на курс, но пользователь в неё НЕ входит.
  await prisma.group.create({ data: { id: "g-eac-3", name: "Group g-eac-3" } });
  await prisma.courseGroupAssignment.create({
    data: { courseId: "c-eac-3", groupId: "g-eac-3", assignedById: "u-eac-3" },
  });

  const result = await repo.findAssignments("c-eac-3", "u-eac-3");
  assert.deepEqual(result.directExpiries, []);
  assert.deepEqual(result.groupExpiries, []);
});

test("findAssignments: несуществующий курс → пустые массивы", async () => {
  const result = await repo.findAssignments("c-eac-нет", "u-eac-нет");
  assert.deepEqual(result.directExpiries, []);
  assert.deepEqual(result.groupExpiries, []);
});

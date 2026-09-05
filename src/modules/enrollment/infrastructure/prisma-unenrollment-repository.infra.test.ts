import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaUnenrollmentRepository } from "./prisma-unenrollment-repository";

// Инфра-тест: репозиторий против настоящей (временной) БД. Запуск: npm run test:infra.

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

test("loadContext: курс, элементы, квизы, флаг прямого назначения", async () => {
  await seedUser("u-load");
  await seedCourse("c-load");
  await prisma.courseItem.create({
    data: { id: "i-load", courseId: "c-load", type: "QUIZ", title: "Тест", orderIndex: 0 },
  });
  await prisma.quiz.create({ data: { id: "q-load", courseItemId: "i-load" } });
  await prisma.courseUserAssignment.create({
    data: { courseId: "c-load", userId: "u-load", assignedById: "u-load" },
  });

  const context = await prismaUnenrollmentRepository.loadContext("c-load", "u-load");
  assert.ok(context);
  assert.equal(context.courseTitle, "Course c-load");
  assert.deepEqual(context.courseItemIds, ["i-load"]);
  assert.deepEqual(context.courseQuizIds, ["q-load"]);
  assert.equal(context.hadDirectAssignment, true);
  assert.equal(context.hadGroupAssignment, false);
});

test("loadContext: несуществующий курс → null", async () => {
  assert.equal(await prismaUnenrollmentRepository.loadContext("нет-такого", "нет"), null);
});

test("applyUnenrollment DELETE_DIRECT удаляет прямое назначение", async () => {
  await seedUser("u-del");
  await seedCourse("c-del");
  await prisma.courseUserAssignment.create({
    data: { courseId: "c-del", userId: "u-del", assignedById: "u-del" },
  });

  await prismaUnenrollmentRepository.applyUnenrollment({
    courseId: "c-del",
    learnerId: "u-del",
    actorId: "u-del",
    assignmentAction: "DELETE_DIRECT",
    overrideExpiresAt: new Date(),
    deleteProgress: false,
    courseItemIds: [],
    courseQuizIds: [],
  });

  const remaining = await prisma.courseUserAssignment.findFirst({
    where: { courseId: "c-del", userId: "u-del" },
  });
  assert.equal(remaining, null);
});

test("applyUnenrollment с deleteProgress чистит просмотры и отзыв", async () => {
  await seedUser("u-prog");
  await seedCourse("c-prog");
  await prisma.courseItem.create({
    data: { id: "i-prog", courseId: "c-prog", type: "TEXT", title: "Материал", orderIndex: 0 },
  });
  await prisma.courseUserAssignment.create({
    data: { courseId: "c-prog", userId: "u-prog", assignedById: "u-prog" },
  });
  await prisma.courseItemView.create({
    data: { courseItemId: "i-prog", userId: "u-prog", progressPercent: 100 },
  });
  await prisma.courseFeedback.create({
    data: { courseId: "c-prog", userId: "u-prog", rating: 5, status: "PUBLISHED" },
  });

  await prismaUnenrollmentRepository.applyUnenrollment({
    courseId: "c-prog",
    learnerId: "u-prog",
    actorId: "u-prog",
    assignmentAction: "DELETE_DIRECT",
    overrideExpiresAt: new Date(),
    deleteProgress: true,
    courseItemIds: ["i-prog"],
    courseQuizIds: [],
  });

  assert.equal(await prisma.courseItemView.count({ where: { userId: "u-prog" } }), 0);
  assert.equal(await prisma.courseFeedback.count({ where: { userId: "u-prog" } }), 0);
});

test("revokeIssuedCertificate: ISSUED → REVOKED, повторно → false", async () => {
  await seedUser("u-cert");
  await seedCourse("c-cert");
  await prisma.certificate.create({
    data: {
      serial: "serial-cert",
      courseId: "c-cert",
      userId: "u-cert",
      issuedVia: "MANUAL",
      completedAt: new Date(),
      snapshotJson: "{}",
    },
  });

  const now = new Date();
  const first = await prismaUnenrollmentRepository.revokeIssuedCertificate({
    courseId: "c-cert",
    learnerId: "u-cert",
    actorId: "u-cert",
    now,
  });
  assert.equal(first, true);
  const cert = await prisma.certificate.findFirst({ where: { serial: "serial-cert" } });
  assert.equal(cert?.status, "REVOKED");

  const second = await prismaUnenrollmentRepository.revokeIssuedCertificate({
    courseId: "c-cert",
    learnerId: "u-cert",
    actorId: "u-cert",
    now,
  });
  assert.equal(second, false, "уже отозван — нечего отзывать");
});

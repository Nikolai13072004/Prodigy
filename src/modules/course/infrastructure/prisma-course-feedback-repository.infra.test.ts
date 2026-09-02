import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaCourseFeedbackRepository as repo } from "./prisma-course-feedback-repository";

// Инфра-тест репозитория отзывов. Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `U ${id}`, passwordHash: "x" },
  });
}
async function seedCourse(id: string) {
  return prisma.course.create({ data: { id, title: `Course ${id}`, status: "PUBLISHED" } });
}

test("getCompletionPercent: null для несуществующего курса", async () => {
  assert.equal(await repo.getCompletionPercent("cf-missing", "cf-u0"), null);
});

test("getCompletionPercent: 100% при просмотренном обязательном материале", async () => {
  const user = await seedUser("cf-u1");
  const course = await seedCourse("cf-c1");
  const item = await prisma.courseItem.create({
    data: { courseId: course.id, type: "TEXT", title: "Урок", orderIndex: 0, isRequired: true },
  });
  await prisma.courseItemView.create({
    data: { courseItemId: item.id, userId: user.id, progressPercent: 100, maxPageSeen: 1, totalPages: 1, viewedAt: new Date() },
  });
  const percent = await repo.getCompletionPercent(course.id, user.id);
  assert.equal(percent, 100);
});

test("upsert → findMyFeedback → delete", async () => {
  const user = await seedUser("cf-u2");
  const course = await seedCourse("cf-c2");
  await repo.transact((tx) =>
    tx.upsertFeedback({ courseId: course.id, userId: user.id, rating: 4, status: "PUBLISHED", comment: "хорошо" }),
  );
  let mine = await repo.findMyFeedback(course.id, user.id);
  assert.equal(mine?.rating, 4);
  assert.equal(mine?.courseTitle, "Course cf-c2");

  // upsert повторно обновляет
  await repo.transact((tx) =>
    tx.upsertFeedback({ courseId: course.id, userId: user.id, rating: 5, status: "PUBLISHED", comment: null }),
  );
  mine = await repo.findMyFeedback(course.id, user.id);
  assert.equal(mine?.rating, 5);
  assert.equal(mine?.comment, null);

  await repo.transact((tx) => tx.deleteFeedback(mine!.id));
  assert.equal(await repo.findMyFeedback(course.id, user.id), null);
});

test("findModeration + publish меняет статус на PUBLISHED", async () => {
  const user = await seedUser("cf-u3");
  const course = await seedCourse("cf-c3");
  await repo.transact((tx) =>
    tx.upsertFeedback({ courseId: course.id, userId: user.id, rating: 3, status: "PENDING", comment: null }),
  );
  const mod = await repo.findModeration(course.id, (await repo.findMyFeedback(course.id, user.id))!.id);
  assert.equal(mod?.status, "PENDING");
  assert.equal(mod?.learnerLogin, "login-cf-u3");

  await repo.transact(async (tx) => {
    await tx.publishFeedback(mod!.id);
    await tx.recordEffects({
      audit: {
        actorId: null, actorLogin: null, actorName: null,
        action: "course_feedback:publish", objectType: "course_feedback",
        objectId: mod!.id, objectLabel: "Course cf-c3", ipAddress: null, userAgent: null,
      },
    });
  });
  const after = await repo.findModeration(course.id, mod!.id);
  assert.equal(after?.status, "PUBLISHED");
});

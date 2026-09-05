import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaSurveySubmissionRepository as repo } from "./prisma-survey-submission-repository";

// Инфра-тест репозитория сдачи опросов против настоящей БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x" },
  });
}

async function seedCourse(id: string, status = "PUBLISHED") {
  return prisma.course.create({
    data: { id, title: `Course ${id}`, status },
  });
}

test("createItemResponse + createItemAnswers + upsertItemView + audit — атомарно", async () => {
  await seedUser("ss-u-1");
  await seedCourse("ss-c-1");
  const item = await prisma.courseItem.create({
    data: {
      courseId: "ss-c-1",
      type: "SURVEY",
      title: "Item",
      orderIndex: 0,
      isRequired: false,
    },
  });
  const template = await prisma.courseItemSurveyTemplate.create({
    data: {
      courseId: "ss-c-1",
      courseItemId: item.id,
      title: "T",
    },
  });
  const question = await prisma.courseItemSurveyQuestion.create({
    data: {
      templateId: template.id,
      title: "Q",
      type: "TEXT",
      isRequired: true,
      orderIndex: 0,
    },
  });

  await repo.transact(async (tx) => {
    const response = await tx.createItemResponse({
      templateId: template.id,
      courseId: "ss-c-1",
      courseItemId: item.id,
      userId: "ss-u-1",
    });
    await tx.createItemAnswers(response.id, [
      { questionId: question.id, ratingValue: null, textValue: "hello" },
    ]);
    await tx.upsertItemView({
      courseItemId: item.id,
      userId: "ss-u-1",
      viewedAt: new Date("2026-05-01T10:00:00Z"),
    });
    await tx.recordEffects({
      audit: {
        actorId: "ss-u-1",
        actorLogin: null,
        actorName: null,
        action: "ss-audit-item",
        objectType: "course_item_survey_response",
        objectId: `${item.id}:ss-u-1`,
        objectLabel: "Item",
        ipAddress: null,
        userAgent: null,
        metadata: { hello: 1 },
      },
    });
  });

  const response = await prisma.courseItemSurveyResponse.findUnique({
    where: {
      courseItemId_userId: { courseItemId: item.id, userId: "ss-u-1" },
    },
    include: { answers: true },
  });
  assert.ok(response);
  assert.equal(response.answers.length, 1);
  assert.equal(response.answers[0].textValue, "hello");

  const view = await prisma.courseItemView.findUnique({
    where: {
      courseItemId_userId: { courseItemId: item.id, userId: "ss-u-1" },
    },
  });
  assert.equal(view?.progressPercent, 100);

  const audits = await prisma.auditLogEvent.findMany({
    where: { action: "ss-audit-item" },
  });
  assert.equal(audits.length, 1);
});

test("createCourseResponse + createCourseAnswers — атомарно", async () => {
  await seedUser("ss-u-2");
  await seedCourse("ss-c-2");
  const template = await prisma.courseSurveyTemplate.create({
    data: { courseId: "ss-c-2", title: "T" },
  });
  const question = await prisma.courseSurveyQuestion.create({
    data: {
      templateId: template.id,
      title: "Q",
      type: "TEXT",
      isRequired: false,
      orderIndex: 0,
    },
  });

  await repo.transact(async (tx) => {
    const response = await tx.createCourseResponse({
      templateId: template.id,
      courseId: "ss-c-2",
      userId: "ss-u-2",
    });
    await tx.createCourseAnswers(response.id, [
      { questionId: question.id, ratingValue: null, textValue: "answer" },
    ]);
  });

  const response = await prisma.courseSurveyResponse.findUnique({
    where: { courseId_userId: { courseId: "ss-c-2", userId: "ss-u-2" } },
    include: { answers: true },
  });
  assert.ok(response);
  assert.equal(response.answers.length, 1);
});

test("hasItemResponse / hasCourseResponse: true при существующем, false иначе", async () => {
  await seedUser("ss-u-3");
  await seedCourse("ss-c-3");
  const item = await prisma.courseItem.create({
    data: {
      courseId: "ss-c-3",
      type: "SURVEY",
      title: "I",
      orderIndex: 0,
      isRequired: false,
    },
  });
  assert.equal(await repo.hasItemResponse(item.id, "ss-u-3"), false);
  const template = await prisma.courseItemSurveyTemplate.create({
    data: { courseId: "ss-c-3", courseItemId: item.id, title: "T" },
  });
  await prisma.courseItemSurveyResponse.create({
    data: {
      templateId: template.id,
      courseId: "ss-c-3",
      courseItemId: item.id,
      userId: "ss-u-3",
    },
  });
  assert.equal(await repo.hasItemResponse(item.id, "ss-u-3"), true);
});

test("transact атомарна: throw откатывает всё", async () => {
  await seedUser("ss-u-tx");
  await seedCourse("ss-c-tx");
  const template = await prisma.courseSurveyTemplate.create({
    data: { courseId: "ss-c-tx", title: "T" },
  });

  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.createCourseResponse({
        templateId: template.id,
        courseId: "ss-c-tx",
        userId: "ss-u-tx",
      });
      throw new Error("boom");
    }),
    /boom/,
  );

  const responses = await prisma.courseSurveyResponse.findMany({
    where: { courseId: "ss-c-tx", userId: "ss-u-tx" },
  });
  assert.equal(responses.length, 0, "response не сохранился");
});

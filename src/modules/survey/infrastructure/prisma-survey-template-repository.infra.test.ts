import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaSurveyTemplateRepository as repo } from "./prisma-survey-template-repository";

// Инфра-тест репозитория шаблонов опросов против настоящей БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedCourse(id: string, status = "DRAFT") {
  return prisma.course.create({
    data: { id, title: `Course ${id}`, status },
  });
}

async function seedActor(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x" },
  });
}

test("upsertCourseTemplate: create → update", async () => {
  await seedCourse("st-c-1");

  const created = await repo.transact(async (tx) =>
    tx.upsertCourseTemplate({
      courseId: "st-c-1",
      existingId: null,
      fields: {
        title: "T",
        description: null,
        introImageUrl: null,
        isActive: true,
        isRequired: false,
      },
    }),
  );
  const row = await prisma.courseSurveyTemplate.findUnique({
    where: { id: created.id },
  });
  assert.equal(row?.title, "T");

  const updated = await repo.transact(async (tx) =>
    tx.upsertCourseTemplate({
      courseId: "st-c-1",
      existingId: created.id,
      fields: {
        title: "T2",
        description: "desc",
        introImageUrl: null,
        isActive: false,
        isRequired: true,
      },
    }),
  );
  assert.equal(updated.id, created.id);
  const row2 = await prisma.courseSurveyTemplate.findUnique({
    where: { id: created.id },
  });
  assert.equal(row2?.title, "T2");
  assert.equal(row2?.isActive, false);
});

test("syncCourseQuestions: create + update + delete", async () => {
  await seedCourse("st-c-sync");

  const template = await repo.transact(async (tx) =>
    tx.upsertCourseTemplate({
      courseId: "st-c-sync",
      existingId: null,
      fields: {
        title: "S",
        description: null,
        introImageUrl: null,
        isActive: true,
        isRequired: false,
      },
    }),
  );

  // seed один существующий вопрос напрямую через prisma
  const existing = await prisma.courseSurveyQuestion.create({
    data: {
      templateId: template.id,
      title: "old",
      type: "TEXT",
      isRequired: true,
      orderIndex: 0,
    },
  });

  await repo.transact(async (tx) =>
    tx.syncCourseQuestions({
      templateId: template.id,
      ops: [
        { kind: "update", id: existing.id, index: 0 },
        { kind: "create", index: 1 },
      ],
      toDeleteIds: [],
      questions: [
        {
          title: "old-updated",
          type: "TEXT",
          optionsJson: null,
          isRequired: true,
        },
        {
          title: "new",
          type: "RATING_5",
          optionsJson: null,
          isRequired: false,
        },
      ],
    }),
  );

  const questions = await prisma.courseSurveyQuestion.findMany({
    where: { templateId: template.id },
    orderBy: { orderIndex: "asc" },
  });
  assert.equal(questions.length, 2);
  assert.equal(questions[0].title, "old-updated");
  assert.equal(questions[1].title, "new");

  // теперь протестируем удаление
  await repo.transact(async (tx) =>
    tx.syncCourseQuestions({
      templateId: template.id,
      ops: [],
      toDeleteIds: [existing.id],
      questions: [],
    }),
  );
  const remaining = await prisma.courseSurveyQuestion.findMany({
    where: { templateId: template.id },
    select: { id: true },
  });
  assert.equal(remaining.length, 1);
});

test("replaceCourseQuestions: удаляет всё и создаёт новые с orderIndex по позиции", async () => {
  await seedCourse("st-c-rep");
  const template = await repo.transact(async (tx) =>
    tx.upsertCourseTemplate({
      courseId: "st-c-rep",
      existingId: null,
      fields: {
        title: "R",
        description: null,
        introImageUrl: null,
        isActive: true,
        isRequired: false,
      },
    }),
  );
  await prisma.courseSurveyQuestion.create({
    data: {
      templateId: template.id,
      title: "to-be-removed",
      type: "TEXT",
      isRequired: true,
      orderIndex: 0,
    },
  });

  await repo.transact(async (tx) =>
    tx.replaceCourseQuestions(template.id, [
      { title: "a", type: "TEXT", optionsJson: null, isRequired: true },
      { title: "b", type: "TEXT", optionsJson: null, isRequired: false },
    ]),
  );

  const rows = await prisma.courseSurveyQuestion.findMany({
    where: { templateId: template.id },
    orderBy: { orderIndex: "asc" },
    select: { title: true, orderIndex: true },
  });
  assert.deepEqual(rows, [
    { title: "a", orderIndex: 0 },
    { title: "b", orderIndex: 1 },
  ]);
});

test("createReusableTemplate: сохраняет и вопросы", async () => {
  await seedCourse("st-c-reu");
  const actor = await seedActor("st-actor-reu");
  const reusable = await repo.transact(async (tx) =>
    tx.createReusableTemplate({
      title: "RT",
      description: null,
      introImageUrl: null,
      isRequired: false,
      sourceCourseId: "st-c-reu",
      createdById: actor.id,
      questions: [
        { title: "q1", type: "TEXT", optionsJson: null, isRequired: true },
      ],
    }),
  );
  const row = await prisma.reusableCourseSurveyTemplate.findUnique({
    where: { id: reusable.id },
    include: { questions: true },
  });
  assert.equal(row?.questions.length, 1);
  assert.equal(row?.questions[0].title, "q1");
});

test("markCourseContentChangedIfPublished: PUBLISHED → true, DRAFT → no-op", async () => {
  const published = await seedCourse("st-c-pub", "PUBLISHED");
  const draft = await seedCourse("st-c-draft", "DRAFT");
  await repo.transact(async (tx) => {
    await tx.markCourseContentChangedIfPublished(published.id);
    await tx.markCourseContentChangedIfPublished(draft.id);
  });
  const publishedRow = await prisma.course.findUnique({
    where: { id: published.id },
    select: { hasUnpublishedChanges: true },
  });
  const draftRow = await prisma.course.findUnique({
    where: { id: draft.id },
    select: { hasUnpublishedChanges: true },
  });
  assert.equal(publishedRow?.hasUnpublishedChanges, true);
  assert.equal(draftRow?.hasUnpublishedChanges, false);
});

test("findItem: живой SURVEY возвращается; архивированный/чужого курса — null", async () => {
  await seedCourse("st-c-find");
  const item = await prisma.courseItem.create({
    data: {
      courseId: "st-c-find",
      type: "SURVEY",
      title: "SI",
      orderIndex: 0,
      isRequired: false,
    },
  });
  const found = await repo.findItem("st-c-find", item.id);
  assert.equal(found?.type, "SURVEY");
  // Чужой courseId
  const other = await repo.findItem("st-c-find-other", item.id);
  assert.equal(other, null);
});

test("findReusableTemplate: собирает вопросы по orderIndex", async () => {
  const actor = await seedActor("st-actor-frt");
  const created = await repo.transact(async (tx) =>
    tx.createReusableTemplate({
      title: "R",
      description: null,
      introImageUrl: null,
      isRequired: false,
      sourceCourseId: null as unknown as string,
      createdById: actor.id,
      questions: [
        { title: "a", type: "TEXT", optionsJson: null, isRequired: true },
        { title: "b", type: "TEXT", optionsJson: null, isRequired: true },
      ],
    }),
  );
  const loaded = await repo.findReusableTemplate(created.id);
  assert.equal(loaded?.questions.length, 2);
  assert.deepEqual(loaded?.questions.map((q) => q.title), ["a", "b"]);
});

test("recordEffects: пишет несколько аудитов подряд", async () => {
  await repo.transact(async (tx) =>
    tx.recordEffects({
      audits: [
        {
          actorId: null,
          actorLogin: null,
          actorName: null,
          action: "st-audit-1",
          objectType: "course_survey",
          objectId: "obj-1",
          objectLabel: "obj-1",
          ipAddress: null,
          userAgent: null,
          metadata: { k: 1 },
        },
        {
          actorId: null,
          actorLogin: null,
          actorName: null,
          action: "st-audit-2",
          objectType: "course_survey_template",
          objectId: "obj-2",
          objectLabel: "obj-2",
          ipAddress: null,
          userAgent: null,
          metadata: { k: 2 },
        },
      ],
    }),
  );
  const rows = await prisma.auditLogEvent.findMany({
    where: { action: { in: ["st-audit-1", "st-audit-2"] } },
    orderBy: { action: "asc" },
  });
  assert.equal(rows.length, 2);
});

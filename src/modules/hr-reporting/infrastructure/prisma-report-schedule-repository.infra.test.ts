import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaReportScheduleRepository as repo } from "./prisma-report-schedule-repository";

// Инфра-тест репозитория расписаний HR-отчётов. Запуск: npm run test:infra.
// Seed-id с префиксом rs- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(id: string) {
  return prisma.user.create({ data: { id, login: `login-${id}`, name: `U ${id}`, passwordHash: "x" } });
}

test("findPublishedCourse: только PUBLISHED", async () => {
  await prisma.course.create({ data: { id: "rs-c-pub", title: "Pub", status: "PUBLISHED" } });
  await prisma.course.create({ data: { id: "rs-c-draft", title: "Draft", status: "DRAFT" } });
  assert.equal((await repo.findPublishedCourse("rs-c-pub"))?.id, "rs-c-pub");
  assert.equal(await repo.findPublishedCourse("rs-c-draft"), null);
});

test("create → findOwnedSchedule → updatePause → delete (+ аудит атомарно)", async () => {
  const user = await seedUser("rs-u1");

  const created = await repo.transact(async (tx) => {
    const schedule = await tx.createSchedule({
      createdById: user.id,
      reportType: "COURSE_SUMMARY",
      courseId: null,
      recipientsJson: JSON.stringify(["a@b.c"]),
      nextRunAt: new Date(Date.now() + 1_000_000),
    });
    await tx.recordAudit({
      actorId: user.id, actorLogin: "login-rs-u1", actorName: "U rs-u1",
      action: "report_schedules:create", objectType: "hr_report_schedule", objectId: schedule.id,
      objectLabel: "Сводный отчет по курсам", ipAddress: null, userAgent: null,
      metadata: { recipientsCount: 1 },
    });
    return schedule;
  });

  const owned = await repo.findOwnedSchedule(created.id, user.id);
  assert.equal(owned?.id, created.id);
  assert.equal(owned?.isPaused, false);
  assert.equal(await repo.findOwnedSchedule(created.id, "rs-other"), null);

  await repo.transact((tx) => tx.updatePause(created.id, true, new Date(Date.now() + 2_000_000)));
  assert.equal((await repo.findOwnedSchedule(created.id, user.id))?.isPaused, true);

  const audit = await prisma.auditLogEvent.findFirst({ where: { objectId: created.id, action: "report_schedules:create" } });
  assert.ok(audit);

  await repo.transact((tx) => tx.deleteSchedule(created.id));
  assert.equal(await repo.findOwnedSchedule(created.id, user.id), null);
});

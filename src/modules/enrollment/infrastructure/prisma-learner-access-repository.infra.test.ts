import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";
import { prismaLearnerAccessRepository as repo } from "./prisma-learner-access-repository";

// Инфра-тест точечного доступа к назначениям курса против настоящей БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(id: string, overrides: { status?: string; email?: string | null } = {}) {
  return prisma.user.create({
    data: {
      id,
      login: `login-${id}`,
      name: `User ${id}`,
      firstName: "Имя",
      passwordHash: "x",
      status: overrides.status ?? USER_STATUSES.ACTIVE,
      email: overrides.email ?? null,
    },
  });
}

async function seedCourse(id: string, status = "PUBLISHED") {
  return prisma.course.create({
    data: { id, title: `Course ${id}`, status },
  });
}

test("loadCourseHead: возвращает id/title/status; missing → null", async () => {
  await seedCourse("la-c-1");
  const head = await repo.loadCourseHead("la-c-1");
  assert.equal(head?.status, "PUBLISHED");
  const missing = await repo.loadCourseHead("la-missing");
  assert.equal(missing, null);
});

test("loadLearners: возвращает запрошенные, пустой вход → []", async () => {
  await seedUser("la-u-1", { email: "u1@corp.ru" });
  await seedUser("la-u-2");

  const rows = await repo.loadLearners(["la-u-1", "la-u-2", "la-missing"]);
  const ids = rows.map((row) => row.id).sort();
  assert.deepEqual(ids, ["la-u-1", "la-u-2"]);
  assert.deepEqual(await repo.loadLearners([]), []);
});

test("upsertLearnerAssignments: create при новом, update при существующем", async () => {
  await seedCourse("la-c-up");
  await seedUser("la-u-up");
  const actor = await seedUser("la-actor-1");

  // Первый вызов — create.
  await repo.transact(async (tx) =>
    tx.upsertLearnerAssignments("la-c-up", actor.id, [
      { learnerId: "la-u-up", expiresAt: new Date("2027-01-01T00:00:00Z") },
    ]),
  );
  let assignment = await prisma.courseUserAssignment.findUnique({
    where: { courseId_userId: { courseId: "la-c-up", userId: "la-u-up" } },
  });
  assert.equal(assignment?.expiresAt?.toISOString(), "2027-01-01T00:00:00.000Z");

  // Второй вызов — update: срок меняется, assignedById обновляется.
  const actor2 = await seedUser("la-actor-2");
  await repo.transact(async (tx) =>
    tx.upsertLearnerAssignments("la-c-up", actor2.id, [
      { learnerId: "la-u-up", expiresAt: null },
    ]),
  );
  assignment = await prisma.courseUserAssignment.findUnique({
    where: { courseId_userId: { courseId: "la-c-up", userId: "la-u-up" } },
  });
  assert.equal(assignment?.expiresAt, null);
  assert.equal(assignment?.assignedById, actor2.id);
});

test("loadLearnerAccessExpiries: собирает прямые и групповые сроки, отсутствующим — пустые массивы", async () => {
  await seedCourse("la-c-ex");
  await seedUser("la-u-a");
  await seedUser("la-u-b");
  await seedUser("la-u-c");
  const actor = await seedUser("la-actor-ex");

  // Прямое назначение только у u-a
  await prisma.courseUserAssignment.create({
    data: {
      courseId: "la-c-ex",
      userId: "la-u-a",
      assignedById: actor.id,
      expiresAt: new Date("2027-01-01T00:00:00Z"),
    },
  });

  // Групповое назначение (курс → группа, u-b в группе)
  const group = await prisma.group.create({ data: { name: "la-grp-ex" } });
  await prisma.groupMembership.create({
    data: { userId: "la-u-b", groupId: group.id },
  });
  await prisma.courseGroupAssignment.create({
    data: {
      courseId: "la-c-ex",
      groupId: group.id,
      assignedById: actor.id,
      expiresAt: new Date("2027-06-01T00:00:00Z"),
    },
  });

  const map = await repo.loadLearnerAccessExpiries("la-c-ex", [
    "la-u-a",
    "la-u-b",
    "la-u-c",
  ]);
  assert.equal(map.get("la-u-a")?.direct.length, 1);
  assert.equal(map.get("la-u-a")?.group.length, 0);
  assert.equal(map.get("la-u-b")?.direct.length, 0);
  assert.equal(map.get("la-u-b")?.group.length, 1);
  assert.equal(map.get("la-u-c")?.direct.length, 0);
  assert.equal(map.get("la-u-c")?.group.length, 0);
});

test("recordEffects: пишет аудит тем же tx-клиентом", async () => {
  await repo.transact(async (tx) =>
    tx.recordEffects({
      audit: {
        actorId: null,
        actorLogin: null,
        actorName: null,
        action: "la-audit-only",
        objectType: "course_assignment",
        objectId: "la-c-ex:la-u-a",
        objectLabel: "la-c-ex",
        ipAddress: null,
        userAgent: null,
        metadata: { hello: 1 },
      },
    }),
  );
  const audits = await prisma.auditLogEvent.findMany({
    where: { action: "la-audit-only" },
  });
  assert.equal(audits.length, 1);
});

test("transact атомарна: throw откатывает upsert", async () => {
  await seedCourse("la-c-tx");
  await seedUser("la-u-tx");
  const actor = await seedUser("la-actor-tx");

  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.upsertLearnerAssignments("la-c-tx", actor.id, [
        {
          learnerId: "la-u-tx",
          expiresAt: new Date("2027-01-01T00:00:00Z"),
        },
      ]);
      throw new Error("boom");
    }),
    /boom/,
  );

  const assignment = await prisma.courseUserAssignment.findUnique({
    where: { courseId_userId: { courseId: "la-c-tx", userId: "la-u-tx" } },
  });
  assert.equal(assignment, null, "апсерт откатился");
});

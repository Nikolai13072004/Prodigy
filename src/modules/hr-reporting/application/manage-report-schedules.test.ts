import assert from "node:assert/strict";
import { test } from "node:test";
import { createManageReportSchedules } from "./manage-report-schedules";
import { ManageReportScheduleError } from "./manage-report-schedules-errors";
import type {
  OwnedScheduleRecord,
  PublishedCourse,
  ReportScheduleRepository,
} from "./manage-report-schedules-ports";

const ACTOR = { id: "hr-1", login: "hr", name: "HR" };
const AUDIT = { ipAddress: null, userAgent: null };

// Чистые хелперы инжектируются — в тестах идентичная нормализация и фиксированное время.
const HELPERS = {
  normalizeReportType: (value: string) => value,
  describeReportType: (type: string, courseTitle: string | null) => `${type}:${courseTitle ?? ""}`,
  initialRunAt: () => new Date("2026-09-02T00:00:00Z"),
};

function makeRepository(opts: {
  course?: PublishedCourse | null;
  owned?: OwnedScheduleRecord | null;
}) {
  const state = {
    created: [] as { reportType: string; courseId: string | null }[],
    paused: [] as { id: string; isPaused: boolean }[],
    deleted: [] as string[],
    audits: [] as { action: string }[],
  };
  const repository: ReportScheduleRepository = {
    async findPublishedCourse() {
      return opts.course === undefined ? { id: "c-1", title: "Курс" } : opts.course;
    },
    async findOwnedSchedule() {
      return opts.owned === undefined
        ? { id: "s-1", reportType: "GENERAL", courseTitle: null, nextRunAt: new Date(Date.now() + 1e9), isPaused: false }
        : opts.owned;
    },
    async transact(execute) {
      return execute({
        async createSchedule(data) {
          state.created.push({ reportType: data.reportType, courseId: data.courseId });
          return { id: "s-new" };
        },
        async updatePause(id, isPaused) {
          state.paused.push({ id, isPaused });
        },
        async deleteSchedule(id) {
          state.deleted.push(id);
        },
        async recordAudit(audit) {
          state.audits.push({ action: audit.action });
        },
      });
    },
  };
  return { repository, state };
}

test("create: отчёт по курсу без опубликованного курса → COURSE_REQUIRED", async () => {
  const { repository, state } = makeRepository({ course: null });
  const m = createManageReportSchedules({ repository, ...HELPERS });
  await assert.rejects(
    m.create({ reportType: "COURSE_RESULTS", courseId: "missing", recipients: ["a@b.c"], actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof ManageReportScheduleError && e.code === "COURSE_REQUIRED",
  );
  assert.equal(state.created.length, 0);
});

test("create: сводный отчёт (без курса) → создаёт + аудит", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageReportSchedules({ repository, ...HELPERS });
  await m.create({ reportType: "COURSE_SUMMARY", courseId: "", recipients: ["a@b.c"], actor: ACTOR, audit: AUDIT });
  assert.equal(state.created.length, 1);
  assert.equal(state.created[0].courseId, null);
  assert.equal(state.audits[0].action, "report_schedules:create");
});

test("togglePause: не найдено → NOT_FOUND", async () => {
  const { repository } = makeRepository({ owned: null });
  const m = createManageReportSchedules({ repository, ...HELPERS });
  await assert.rejects(
    m.togglePause({ scheduleId: "x", mode: "pause", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof ManageReportScheduleError && e.code === "NOT_FOUND",
  );
});

test("togglePause pause → isPaused=true + аудит pause", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageReportSchedules({ repository, ...HELPERS });
  await m.togglePause({ scheduleId: "s-1", mode: "pause", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.paused, [{ id: "s-1", isPaused: true }]);
  assert.equal(state.audits[0].action, "report_schedules:pause");
});

test("togglePause resume → isPaused=false + аудит resume", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageReportSchedules({ repository, ...HELPERS });
  await m.togglePause({ scheduleId: "s-1", mode: "resume", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.paused, [{ id: "s-1", isPaused: false }]);
  assert.equal(state.audits[0].action, "report_schedules:resume");
});

test("remove: удаляет + аудит delete", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageReportSchedules({ repository, ...HELPERS });
  await m.remove({ scheduleId: "s-1", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.deleted, ["s-1"]);
  assert.equal(state.audits[0].action, "report_schedules:delete");
});

test("remove: не найдено → NOT_FOUND", async () => {
  const { repository } = makeRepository({ owned: null });
  const m = createManageReportSchedules({ repository, ...HELPERS });
  await assert.rejects(
    m.remove({ scheduleId: "x", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof ManageReportScheduleError && e.code === "NOT_FOUND",
  );
});

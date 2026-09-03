import assert from "node:assert/strict";
import { test } from "node:test";
import { combineRoleNames, createBlockLearnerAsHr } from "./block-learner-as-hr";
import { BlockLearnerError } from "./block-learner-as-hr-errors";
import type { BlockLearnerRepository, LearnerToBlock } from "./block-learner-as-hr-ports";

const ACTOR = { id: "hr-1", login: "hr", name: "HR" };
const AUDIT = { ipAddress: "1.1.1.1", userAgent: "ua" };

function student(overrides: Partial<LearnerToBlock> = {}): LearnerToBlock {
  return {
    id: "u-1",
    name: "Иван",
    login: "ivan",
    email: "u@example.com",
    status: "ACTIVE",
    role: "Ученик",
    roleProfileNames: ["Ученик"],
    ...overrides,
  };
}

function makeRepository(opts: { learner?: LearnerToBlock | null; relatedCourseIds?: string[] }) {
  const state = {
    blocked: [] as string[],
    cancelled: [] as string[],
    audits: [] as { action: string; metadata: unknown }[],
  };
  const repository: BlockLearnerRepository = {
    async findLearner() {
      return opts.learner === undefined ? student() : opts.learner;
    },
    async findRelatedCourseIds() {
      return opts.relatedCourseIds ?? [];
    },
    async transact(execute) {
      return execute({
        async blockUser(id) {
          state.blocked.push(id);
        },
        async cancelPendingActivationInvites(id) {
          state.cancelled.push(id);
        },
        async recordAudit(audit) {
          state.audits.push({ action: audit.action, metadata: audit.metadata });
        },
      });
    },
  };
  return { repository, state };
}

test("combineRoleNames: объединяет без дублей, отбрасывает пустые", () => {
  assert.deepEqual(combineRoleNames("Ученик", ["Ученик", "HR"]).sort(), ["HR", "Ученик"]);
  assert.deepEqual(combineRoleNames("", [""]), []);
});

test("не найден → NOT_FOUND", async () => {
  const { repository, state } = makeRepository({ learner: null });
  const run = createBlockLearnerAsHr({ repository });
  await assert.rejects(
    run({ learnerId: "x", source: "s", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof BlockLearnerError && e.code === "NOT_FOUND",
  );
  assert.equal(state.blocked.length, 0);
});

test("не ученик → NOT_STUDENT", async () => {
  const { repository } = makeRepository({
    learner: student({ role: "HR", roleProfileNames: ["HR"] }),
  });
  const run = createBlockLearnerAsHr({ repository });
  await assert.rejects(
    run({ learnerId: "u-1", source: "s", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof BlockLearnerError && e.code === "NOT_STUDENT",
  );
});

test("уже архивирован → ALREADY_ARCHIVED с login", async () => {
  const { repository } = makeRepository({ learner: student({ status: "ARCHIVED" }) });
  const run = createBlockLearnerAsHr({ repository });
  await assert.rejects(
    run({ learnerId: "u-1", source: "s", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof BlockLearnerError && e.code === "ALREADY_ARCHIVED" && e.login === "ivan",
  );
});

test("уже заблокирован → ALREADY_BLOCKED с login", async () => {
  const { repository } = makeRepository({ learner: student({ status: "BLOCKED" }) });
  const run = createBlockLearnerAsHr({ repository });
  await assert.rejects(
    run({ learnerId: "u-1", source: "s", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof BlockLearnerError && e.code === "ALREADY_BLOCKED" && e.login === "ivan",
  );
});

test("happy-path: блок + отмена активаций + аудит, возврат курсов", async () => {
  const { repository, state } = makeRepository({
    learner: student(),
    relatedCourseIds: ["c-1", "c-2"],
  });
  const run = createBlockLearnerAsHr({ repository });
  const res = await run({ learnerId: "u-1", source: "course_learner_detail", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.blocked, ["u-1"]);
  assert.deepEqual(state.cancelled, ["u-1"]);
  assert.equal(state.audits[0].action, "users:block");
  assert.deepEqual((state.audits[0].metadata as { source: string }).source, "course_learner_detail");
  assert.deepEqual(res.relatedCourseIds, ["c-1", "c-2"]);
  assert.equal(res.learner.login, "ivan");
});

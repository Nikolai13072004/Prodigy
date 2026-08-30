import assert from "node:assert/strict";
import test from "node:test";
import { createManageCourseSettings } from "./manage-course-settings";
import type {
  CourseDetails,
  CourseSettingsRepository,
  CourseSettingsTransaction,
} from "./ports";

const actor = { id: "admin", login: "admin@test", name: "Admin", ipAddress: null, userAgent: null };
const details: CourseDetails = {
  title: "Course",
  description: "Description",
  requirements: null,
  targetAudience: null,
  category: null,
  difficultyLevel: null,
  durationMinutes: 60,
  tagsJson: null,
  thumbnailUrl: null,
  coverUrl: null,
  navigationMode: "FREE",
  resultViewMode: "SCORE_ONLY",
};

test("course details, draft marker, and audit share one transaction", async () => {
  const calls: string[] = [];
  const service = createManageCourseSettings(repositoryWith({
    loadDetails: async () => ({ id: "course", ...details, title: "Old" }),
    updateDetails: async () => { calls.push("update"); },
    markContentChanged: async () => { calls.push("mark"); },
    recordAudit: async () => { calls.push("audit"); },
  }));

  const result = await service.updateDetails({ courseId: "course", details, actor });
  assert.equal(result.changed, true);
  assert.deepEqual(calls, ["update", "mark", "audit"]);
});

test("unchanged course title performs no writes", async () => {
  let writes = 0;
  const service = createManageCourseSettings(repositoryWith({
    loadTitle: async () => ({ id: "course", title: "Course" }),
    updateTitle: async () => { writes += 1; },
    markContentChanged: async () => { writes += 1; },
    recordAudit: async () => { writes += 1; },
  }));

  const result = await service.updateTitle({ courseId: "course", title: "Course", actor });
  assert.equal(result.changed, false);
  assert.equal(writes, 0);
});

test("progression is calculated from repository items before persisting", async () => {
  let savedRequiredIds: string[] = [];
  const service = createManageCourseSettings(repositoryWith({
    loadProgression: async () => ({
      id: "course",
      title: "Course",
      navigationMode: "FREE",
      completionMode: "ALL_ITEMS",
      quizGateMode: "RESOLVED",
      statusFormat: "COMPLETED_ONLY",
      gradedItemIdsJson: null,
      items: [{ id: "lesson", type: "TEXT" }, { id: "quiz", type: "QUIZ" }],
    }),
    updateProgression: async (_courseId, plan) => { savedRequiredIds = plan.requiredItemIds; },
  }));

  await service.updateProgression({
    courseId: "course",
    navigationMode: "FREE",
    quizGateMode: "RESOLVED",
    completionMode: "ALL_ITEMS",
    statusFormat: "COMPLETED_ONLY",
    requestedRequiredItemIds: [],
    requestedGradedItemIds: [],
    actor,
  });
  assert.deepEqual(savedRequiredIds, ["lesson", "quiz"]);
});

function repositoryWith(overrides: Partial<CourseSettingsTransaction>): CourseSettingsRepository {
  const defaults: CourseSettingsTransaction = {
    loadDetails: async () => null,
    updateDetails: async () => undefined,
    loadTitle: async () => null,
    updateTitle: async () => undefined,
    loadProgression: async () => null,
    updateProgression: async () => undefined,
    markContentChanged: async () => undefined,
    recordAudit: async () => undefined,
  };
  return { transact: (execute) => execute({ ...defaults, ...overrides }) };
}

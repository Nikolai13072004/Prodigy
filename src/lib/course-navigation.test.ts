import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCourseOutline, pickActiveCourseOutlineEntry } from "./course-navigation";

// Сборка структуры курса (прогресс, статусы, блокировки) и выбор активного пункта.
// Все данные — детерминированные фикстуры, без БД.

type Attempt = Parameters<typeof buildCourseOutline>[0][number]["quiz"] extends infer Q
  ? Q extends { attempts: infer A }
    ? A extends Array<infer T>
      ? T
      : never
    : never
  : never;

type Item = Parameters<typeof buildCourseOutline>[0][number];

function attempt(outcome: string, opts: { n?: number; completedAt?: Date; correct?: number } = {}): Attempt {
  const n = opts.n ?? 1;
  return {
    id: `att-${n}`,
    outcome,
    correctAnswers: opts.correct ?? (outcome === "PASSED" ? 1 : 0),
    attemptNumber: n,
    score: opts.correct ?? 0,
    maxScore: 1,
    completedAt: opts.completedAt ?? new Date("2026-08-10T10:00:00Z"),
  };
}

function material(
  id: string,
  opts: { progress?: number; required?: boolean; type?: string; viewedAt?: Date } = {},
): Item {
  return {
    id,
    moduleId: null,
    orderIndex: 0,
    type: opts.type ?? "TEXT",
    title: id,
    content: null,
    fileUrl: null,
    totalSlides: null,
    isRequired: opts.required ?? false,
    views:
      opts.progress === undefined
        ? []
        : [{ progressPercent: opts.progress, viewedAt: opts.viewedAt ?? new Date("2026-08-01T00:00:00Z") }],
    quiz: null,
  };
}

function quizItem(
  id: string,
  opts: { attempts?: Attempt[]; maxAttempts?: number; required?: boolean; lockMaterialsOnStart?: boolean } = {},
): Item {
  return {
    id,
    moduleId: null,
    orderIndex: 0,
    type: "QUIZ",
    title: id,
    content: null,
    fileUrl: null,
    totalSlides: null,
    isRequired: opts.required ?? false,
    views: [],
    quiz: {
      id: `${id}-quiz`,
      description: null,
      maxAttempts: opts.maxAttempts ?? 1,
      minCorrectAnswers: 1,
      lockMaterialsOnStart: opts.lockMaterialsOnStart ?? false,
      questions: [{ id: "q1" }],
      attempts: opts.attempts ?? [],
    },
  };
}

// ------------------------------------------------------------- материалы

test("материалы: прогресс задаёт статус, процент и завершённость", () => {
  const outline = buildCourseOutline(
    [material("m1", { progress: 100 }), material("m2", { progress: 40 }), material("m3")],
    "FREE",
  );
  assert.equal(outline[0].isCompleted, true);
  assert.equal(outline[0].statusLabel, "Завершен");
  assert.equal(outline[0].progressPercent, 100);
  assert.equal(outline[0].typeLabel, "Текст");
  assert.equal(outline[0].itemNumber, 1);

  assert.equal(outline[1].isCompleted, false);
  assert.equal(outline[1].statusLabel, "В процессе");
  assert.equal(outline[1].progressPercent, 40);

  assert.equal(outline[2].statusLabel, "Не начат");
  assert.equal(outline[2].progressPercent, 0);
  assert.equal(outline[2].viewedAt, null, "без просмотра нет даты");
  assert.ok(outline.every((entry) => !entry.isLocked), "в FREE ничего не заблокировано");
});

// ------------------------------------------------------------- тесты (quiz)

test("quiz при шлюзе RESOLVED: пройден и провален считаются завершёнными", () => {
  const outline = buildCourseOutline(
    [
      quizItem("passed", { attempts: [attempt("PASSED")] }),
      quizItem("failed", { attempts: [attempt("FAILED")], maxAttempts: 1 }),
      quizItem("fresh"),
      quizItem("running", { attempts: [attempt("IN_PROGRESS")] }),
      quizItem("review", { attempts: [attempt("PENDING_REVIEW")] }),
    ],
    "FREE",
  );
  const byId = Object.fromEntries(outline.map((e) => [e.id, e]));

  assert.equal(byId.passed.isCompleted, true);
  assert.equal(byId.passed.statusLabel, "Пройден");
  assert.equal(byId.passed.progressPercent, 100);
  assert.equal(byId.passed.typeLabel, "Тест");

  assert.equal(byId.failed.isCompleted, true, "проваленный при RESOLVED — «решён»");
  assert.equal(byId.failed.statusLabel, "Не пройден");
  assert.equal(byId.failed.progressPercent, 100);

  assert.equal(byId.fresh.isCompleted, false);
  assert.equal(byId.fresh.statusLabel, "Не начат");
  assert.equal(byId.fresh.progressPercent, 0);
  assert.equal(byId.fresh.viewedAt, null);

  assert.equal(byId.running.statusLabel, "В работе");
  assert.equal(byId.running.progressPercent, 50, "начатый тест — 50%");
  assert.equal(byId.review.statusLabel, "На проверке");
  assert.equal(byId.review.progressPercent, 50);
});

test("quiz при шлюзе PASSED: проваленный не завершён", () => {
  const outline = buildCourseOutline(
    [quizItem("failed", { attempts: [attempt("FAILED")], maxAttempts: 1 })],
    "FREE",
    { quizGateMode: "PASSED" },
  );
  assert.equal(outline[0].isCompleted, false, "нужен именно проход");
  assert.equal(outline[0].progressPercent, 50, "попытка использована → 50%");
  assert.equal(outline[0].statusLabel, "Не пройден");
});

test("viewedAt теста = дата последней попытки", () => {
  const outline = buildCourseOutline(
    [
      quizItem("q", {
        maxAttempts: 2,
        attempts: [
          attempt("FAILED", { n: 1, completedAt: new Date("2026-08-10T10:00:00Z") }),
          attempt("FAILED", { n: 2, completedAt: new Date("2026-08-12T15:00:00Z") }),
        ],
      }),
    ],
    "FREE",
  );
  assert.deepEqual(outline[0].viewedAt, new Date("2026-08-12T15:00:00Z"));
});

// ------------------------------------------------------------- блокировки

test("SEQUENTIAL: первый незавершённый обязательный открыт, следующий за ним — заблокирован", () => {
  const outline = buildCourseOutline(
    [
      material("m1", { progress: 100, required: true }),
      material("m2", { progress: 0, required: true }),
      material("m3", { progress: 0, required: true }),
    ],
    "SEQUENTIAL",
  );
  assert.equal(outline[0].isLocked, false, "завершённый открыт");
  assert.equal(outline[1].isLocked, false, "первый незавершённый ещё открыт");
  assert.equal(outline[2].isLocked, true, "следующий заблокирован");
  assert.equal(outline[2].lockReason, "SEQUENTIAL");
  assert.equal(outline[2].statusLabel, "Заблокирован");
});

test("lockQuizzesUntilPreviousRequiredComplete: тест закрыт, материалы в FREE — нет", () => {
  const outline = buildCourseOutline(
    [material("m1", { progress: 0, required: true }), quizItem("q", { required: true })],
    "FREE",
    { lockQuizzesUntilPreviousRequiredComplete: true },
  );
  assert.equal(outline[0].isLocked, false, "материал в FREE не блокируется");
  assert.equal(outline[1].isLocked, true, "тест закрыт до завершения обязательного материала");
  assert.equal(outline[1].lockReason, "SEQUENTIAL");
});

test("lockMaterialsWhenQuizStarted: начатый блокирующий тест закрывает материалы", () => {
  const outline = buildCourseOutline(
    [material("m1"), quizItem("q", { lockMaterialsOnStart: true, attempts: [attempt("IN_PROGRESS")] })],
    "FREE",
    { lockMaterialsWhenQuizStarted: true },
  );
  assert.equal(outline[0].isLocked, true);
  assert.equal(outline[0].lockReason, "QUIZ_STARTED");
  assert.equal(outline[1].isLocked, false, "сам тест не блокируется");
});

test("lockMaterialsWhenQuizStarted не срабатывает, если блокирующий тест пройден", () => {
  const outline = buildCourseOutline(
    [material("m1"), quizItem("q", { lockMaterialsOnStart: true, attempts: [attempt("PASSED")] })],
    "FREE",
    { lockMaterialsWhenQuizStarted: true },
  );
  assert.equal(outline[0].isLocked, false);
});

// ------------------------------------------------------- pickActiveCourseOutlineEntry

test("pick: запрошенный незаблокированный пункт выигрывает", () => {
  const outline = buildCourseOutline(
    [material("a", { progress: 100 }), material("b", { progress: 50 }), material("c")],
    "FREE",
  );
  assert.equal(pickActiveCourseOutlineEntry(outline, { requestedItemId: "b" })?.id, "b");
});

test("pick: заблокированный запрошенный пропускается, дальше — lastOpened", () => {
  const outline = buildCourseOutline(
    [
      material("a", { progress: 100, required: true }),
      material("b", { progress: 0, required: true }),
      material("c", { progress: 0, required: true }), // заблокирован в SEQUENTIAL
    ],
    "SEQUENTIAL",
  );
  // c заблокирован → пропущен; lastOpened=b открыт → b
  assert.equal(pickActiveCourseOutlineEntry(outline, { requestedItemId: "c", lastOpenedItemId: "b" })?.id, "b");
});

test("pick: без подсказок берётся начатый, затем первый незавершённый", () => {
  const withInProgress = buildCourseOutline(
    [material("a", { progress: 100 }), material("b", { progress: 50 }), material("c")],
    "FREE",
  );
  assert.equal(pickActiveCourseOutlineEntry(withInProgress, {})?.id, "b", "начатый в приоритете");

  const noInProgress = buildCourseOutline([material("a", { progress: 100 }), material("c")], "FREE");
  assert.equal(pickActiveCourseOutlineEntry(noInProgress, {})?.id, "c", "первый незавершённый");
});

test("pick: всё завершено → первый доступный (фолбэк)", () => {
  const outline = buildCourseOutline(
    [material("a", { progress: 100 }), material("b", { progress: 100 })],
    "FREE",
  );
  assert.equal(pickActiveCourseOutlineEntry(outline, {})?.id, "a");
});

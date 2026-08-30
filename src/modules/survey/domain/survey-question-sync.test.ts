import assert from "node:assert/strict";
import { test } from "node:test";
import { planSurveyQuestionSync } from "./survey-question-sync";

test("существующий id → update, новый/без id → create, порядок сохранён", () => {
  const plan = planSurveyQuestionSync(
    ["q1", "q2"],
    [{ id: "q1" }, {}, { id: "new-but-absent" }, { id: "q2" }],
  );
  assert.deepEqual(plan.ops, [
    { kind: "update", id: "q1", index: 0 },
    { kind: "create", index: 1 },
    { kind: "create", index: 2 },
    { kind: "update", id: "q2", index: 3 },
  ]);
});

test("исчезнувшие из входящих существующие id уходят в toDeleteIds", () => {
  const plan = planSurveyQuestionSync(["q1", "q2", "q3"], [{ id: "q2" }]);
  assert.deepEqual(plan.toDeleteIds, ["q1", "q3"]);
  assert.deepEqual(plan.ops, [{ kind: "update", id: "q2", index: 0 }]);
});

test("нет существующих → все create, удалять нечего", () => {
  const plan = planSurveyQuestionSync([], [{}, {}]);
  assert.deepEqual(plan.ops, [
    { kind: "create", index: 0 },
    { kind: "create", index: 1 },
  ]);
  assert.deepEqual(plan.toDeleteIds, []);
});

test("id, которого нет среди существующих, трактуется как create (а не update)", () => {
  const plan = planSurveyQuestionSync(["q1"], [{ id: "ghost" }]);
  assert.deepEqual(plan.ops, [{ kind: "create", index: 0 }]);
  assert.deepEqual(plan.toDeleteIds, ["q1"], "старый q1 удаляется");
});

test("пустой входящий список → всё существующее на удаление", () => {
  const plan = planSurveyQuestionSync(["q1", "q2"], []);
  assert.deepEqual(plan.ops, []);
  assert.deepEqual(plan.toDeleteIds, ["q1", "q2"]);
});

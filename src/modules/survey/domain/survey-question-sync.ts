// Чистое планирование синхронизации вопросов шаблона опроса (update/create/delete).
// Раньше инлайн-дубль в saveCourseSurveyTemplate и saveCourseItemSurveyTemplate.
// Операции возвращаются В ПОРЯДКЕ входящих вопросов — транспорт применяет их как единый цикл,
// поэтому поведение (и orderIndex = позиция) сохраняется дословно.

export type SurveyQuestionSyncInput = { id?: string | null };

export type SurveyQuestionSyncOp =
  | { kind: "update"; id: string; index: number }
  | { kind: "create"; index: number };

export type SurveyQuestionSyncPlan = {
  ops: SurveyQuestionSyncOp[];
  toDeleteIds: string[];
};

export function planSurveyQuestionSync(
  existingQuestionIds: string[],
  incoming: SurveyQuestionSyncInput[],
): SurveyQuestionSyncPlan {
  const existing = new Set(existingQuestionIds);
  const incomingIds = new Set(
    incoming.map((question) => question.id).filter((id): id is string => Boolean(id)),
  );

  const ops: SurveyQuestionSyncOp[] = incoming.map((question, index) =>
    question.id && existing.has(question.id)
      ? { kind: "update", id: question.id, index }
      : { kind: "create", index },
  );

  const toDeleteIds = [...existing].filter((id) => !incomingIds.has(id));

  return { ops, toDeleteIds };
}

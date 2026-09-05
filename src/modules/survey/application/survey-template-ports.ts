// Единый порт для редактирования шаблонов опросов: course-level
// (CourseSurveyTemplate) и item-level (CourseItemSurveyTemplate).
// Аудит массовый (иногда пишутся сразу два — save + reusable created),
// поэтому recordEffects принимает массив.

export type SurveyAudit = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  objectLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
};

export type SurveyEffects = {
  audits?: SurveyAudit[];
};

export type SurveyTemplateFields = {
  title: string;
  description: string | null;
  introImageUrl: string | null;
  isActive: boolean;
  isRequired: boolean;
};

export type SurveyQuestionData = {
  title: string;
  type: string;
  optionsJson: string | null;
  isRequired: boolean;
};

export type SurveyQuestionSyncOp =
  | { kind: "update"; id: string; index: number }
  | { kind: "create"; index: number };

export type SurveyQuestionsSyncArgs = {
  templateId: string;
  ops: SurveyQuestionSyncOp[];
  toDeleteIds: string[];
  // questions.length === количество ops; orderIndex = index в этом массиве.
  // Инфра сама подбирает данные вопроса по op.index.
  questions: SurveyQuestionData[];
};

export type ReusableTemplateSnapshot = {
  id: string;
  title: string;
  description: string | null;
  introImageUrl: string | null;
  isRequired: boolean;
  questions: SurveyQuestionData[];
};

export type CreateReusableTemplateInput = {
  title: string;
  description: string | null;
  introImageUrl: string | null;
  isRequired: boolean;
  sourceCourseId: string;
  createdById: string;
  questions: SurveyQuestionData[];
};

export type CourseTemplateSnapshot = {
  id: string;
  existingQuestionIds: string[];
};

export type CourseItemSnapshot = {
  id: string;
  type: string;
};

export type CourseItemTemplateSnapshot = {
  id: string;
  existingQuestionIds: string[];
};

export interface SurveyTemplateTransaction {
  upsertCourseTemplate(input: {
    courseId: string;
    existingId: string | null;
    fields: SurveyTemplateFields;
  }): Promise<{ id: string }>;
  syncCourseQuestions(args: SurveyQuestionsSyncArgs): Promise<void>;
  replaceCourseQuestions(
    templateId: string,
    questions: SurveyQuestionData[],
  ): Promise<void>;

  updateCourseItem(
    itemId: string,
    fields: { title: string; isRequired: boolean },
  ): Promise<void>;
  upsertItemTemplate(input: {
    courseId: string;
    courseItemId: string;
    existingId: string | null;
    fields: SurveyTemplateFields;
  }): Promise<{ id: string }>;
  syncItemQuestions(args: SurveyQuestionsSyncArgs): Promise<void>;
  replaceItemQuestions(
    templateId: string,
    questions: SurveyQuestionData[],
  ): Promise<void>;

  createReusableTemplate(
    input: CreateReusableTemplateInput,
  ): Promise<{ id: string }>;
  // Стандартный триггер: помечать курс изменённым имеет смысл только для
  // PUBLISHED, чтобы drafts не тегались. Внутри — no-op для не-PUBLISHED.
  markCourseContentChangedIfPublished(courseId: string): Promise<void>;

  recordEffects(effects: SurveyEffects): Promise<void>;
}

export interface SurveyTemplateRepository {
  findCourseTemplate(courseId: string): Promise<CourseTemplateSnapshot | null>;
  findItem(
    courseId: string,
    itemId: string,
  ): Promise<CourseItemSnapshot | null>;
  findItemTemplate(
    courseItemId: string,
  ): Promise<CourseItemTemplateSnapshot | null>;
  findReusableTemplate(
    reusableTemplateId: string,
  ): Promise<ReusableTemplateSnapshot | null>;
  transact<T>(
    execute: (transaction: SurveyTemplateTransaction) => Promise<T>,
  ): Promise<T>;
}

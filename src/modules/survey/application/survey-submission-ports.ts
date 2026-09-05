// Порты для отправки ответов на опросы (учеником).
// Один репозиторий обслуживает обе операции: item-level (survey привязан к
// CourseItem внутри программы курса) и course-level (survey на самом курсе).

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

export type SurveySubmissionEffects = {
  audit?: SurveyAudit;
};

// Общий вход для планировщика ответа: id и мета вопросов, чтобы валидатор
// планировал вне use-case (planSurveyAnswers сам ест такой массив).
export type SurveyTemplateQuestion = {
  id: string;
  title: string;
  type: string;
  optionsJson: string | null;
  isRequired: boolean;
};

// Контекст item-survey: всё, что нужно buildCourseOutline + surveyTemplate.
export type CourseItemSurveyContext = {
  course: {
    id: string;
    title: string;
    status: string;
    navigationMode: string;
    quizGateMode: string;
    owner: {
      name: string;
      email: string | null;
      firstName: string;
    } | null;
  };
  items: Array<{
    id: string;
    moduleId: string | null;
    orderIndex: number;
    type: string;
    title: string;
    content: string | null;
    fileUrl: string | null;
    totalSlides: number | null;
    isRequired: boolean;
    module: {
      id: string;
      title: string;
      description: string | null;
      orderIndex: number;
    } | null;
    views: Array<{ progressPercent: number; viewedAt: Date }>;
    quiz: {
      id: string;
      description: string | null;
      maxAttempts: number;
      minCorrectAnswers: number;
      lockMaterialsOnStart: boolean;
      questions: Array<{ id: string }>;
      attempts: Array<{
        id: string;
        outcome: string;
        correctAnswers: number;
        attemptNumber: number;
        score: number;
        maxScore: number;
        completedAt: Date;
      }>;
    } | null;
  }>;
  surveyItem: {
    id: string;
    title: string;
    templateId: string;
    templateTitle: string;
    templateIsActive: boolean;
    questions: SurveyTemplateQuestion[];
  } | null;
};

// Контекст course-survey: то, что нужно getCourseProgress + surveyTemplate.
export type CourseSurveyContext = {
  course: {
    id: string;
    title: string;
    quizGateMode: string;
    owner: {
      name: string;
      email: string | null;
      firstName: string;
    } | null;
  };
  items: Array<{
    id: string;
    type: string;
    title: string;
    isRequired: boolean;
    views: Array<{ progressPercent: number }>;
    quiz: {
      maxAttempts: number;
      minCorrectAnswers: number;
      attempts: Array<{
        outcome: string;
        correctAnswers: number;
        attemptNumber: number;
        score: number;
        completedAt: Date;
      }>;
    } | null;
  }>;
  surveyTemplate: {
    id: string;
    title: string;
    isActive: boolean;
    questions: SurveyTemplateQuestion[];
  } | null;
};

export type LearnerHead = {
  id: string;
  name: string;
  email: string | null;
  login: string;
};

export type SurveyAnswerWrite = {
  questionId: string;
  ratingValue: number | null;
  textValue: string | null;
};

export interface SurveySubmissionTransaction {
  createItemResponse(input: {
    templateId: string;
    courseId: string;
    courseItemId: string;
    userId: string;
  }): Promise<{ id: string }>;
  createItemAnswers(
    responseId: string,
    answers: SurveyAnswerWrite[],
  ): Promise<void>;
  upsertItemView(input: {
    courseItemId: string;
    userId: string;
    viewedAt: Date;
  }): Promise<void>;

  createCourseResponse(input: {
    templateId: string;
    courseId: string;
    userId: string;
  }): Promise<{ id: string }>;
  createCourseAnswers(
    responseId: string,
    answers: SurveyAnswerWrite[],
  ): Promise<void>;

  recordEffects(effects: SurveySubmissionEffects): Promise<void>;
}

export interface SurveySubmissionRepository {
  isUserAssignedToCourse(userId: string, courseId: string): Promise<boolean>;
  loadItemSurveyContext(
    courseId: string,
    itemId: string,
    userId: string,
  ): Promise<CourseItemSurveyContext | null>;
  loadCourseSurveyContext(
    courseId: string,
    userId: string,
  ): Promise<CourseSurveyContext | null>;
  loadLearner(userId: string): Promise<LearnerHead | null>;
  hasItemResponse(courseItemId: string, userId: string): Promise<boolean>;
  hasCourseResponse(courseId: string, userId: string): Promise<boolean>;
  transact<T>(
    execute: (transaction: SurveySubmissionTransaction) => Promise<T>,
  ): Promise<T>;
}

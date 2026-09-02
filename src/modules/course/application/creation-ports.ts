// Порт для 4 сценариев создания курса: пустой, из презентации, из шаблона,
// копия. Их общее ядро — course.create + опциональные modules/items с nested
// quiz+questions, поэтому держим один порт с широким createItem.

export type CourseCreationAudit = {
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

export type CourseCreationEffects = {
  audit?: CourseCreationAudit;
};

export type CourseCreateData = {
  title: string;
  description: string;
  category: string | null;
  difficultyLevel: string | null;
  durationMinutes: number | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  ownerId: string;
  requirements?: string | null;
  targetAudience?: string | null;
  tagsJson?: string | null;
  navigationMode?: string;
  quizGateMode?: string;
  completionMode?: string;
  statusFormat?: string;
  gradedItemIdsJson?: string | null;
  resultViewMode?: string;
};

export type CreateItemQuizSpec = {
  description: string | null;
  maxAttempts: number;
  minCorrectAnswers: number;
  questions: Array<{
    orderIndex: number;
    type: string;
    prompt: string;
    config: string;
    points: number;
  }>;
};

export type CreateCourseItemInput = {
  courseId: string;
  moduleId: string | null;
  orderIndex: number;
  type: string;
  title: string;
  content: string | null;
  fileUrl: string | null;
  totalSlides: number | null;
  presentationViewMode: string;
  isRequired: boolean;
  // Для QUIZ item — обязателен spec (без questions создастся пустой quiz).
  // Для остальных типов quiz=null.
  quiz: CreateItemQuizSpec | null;
};

export type CourseCopySnapshot = {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  targetAudience: string | null;
  category: string | null;
  difficultyLevel: string | null;
  durationMinutes: number | null;
  tagsJson: string | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  navigationMode: string;
  quizGateMode: string;
  completionMode: string;
  statusFormat: string;
  gradedItemIdsJson: string | null;
  resultViewMode: string;
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    orderIndex: number;
  }>;
  items: Array<{
    id: string;
    moduleId: string | null;
    orderIndex: number;
    type: string;
    title: string;
    content: string | null;
    fileUrl: string | null;
    totalSlides: number | null;
    presentationViewMode: string;
    isRequired: boolean;
    quiz: {
      description: string | null;
      maxAttempts: number;
      minCorrectAnswers: number;
      questions: Array<{
        orderIndex: number;
        type: string;
        prompt: string;
        config: string;
        points: number;
      }>;
    } | null;
  }>;
};

export interface CourseCreationTransaction {
  createCourse(data: CourseCreateData): Promise<{ id: string; title: string }>;
  createModule(data: {
    courseId: string;
    title: string;
    description?: string | null;
    orderIndex: number;
  }): Promise<{ id: string }>;
  // Возвращает id элемента и (для QUIZ) id созданного quiz — нужен для
  // редиректа в builder после createCourseFromPresentation.
  createItem(
    data: CreateCourseItemInput,
  ): Promise<{ id: string; quizId: string | null }>;
  recordEffects(effects: CourseCreationEffects): Promise<void>;
}

export interface CourseCreationRepository {
  findCourseForCopy(courseId: string): Promise<CourseCopySnapshot | null>;
  transact<T>(
    execute: (transaction: CourseCreationTransaction) => Promise<T>,
  ): Promise<T>;
}

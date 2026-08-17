export type CourseContentItemType = "TEXT" | "VIDEO" | "PDF" | "QUIZ" | "SURVEY";

export type CourseCoverUpdate = {
  coverUrl?: string | null;
  thumbnailUrl?: string | null;
};

export type SurveyItemSpecification = {
  title: string;
  description: string;
  isActive: boolean;
  isRequired: boolean;
  questions: Array<{
    title: string;
    type: string;
    optionsJson: string | null;
    isRequired: boolean;
    orderIndex: number;
  }>;
};

export type CreateContentItemData = CourseCoverUpdate & {
  courseId: string;
  moduleId: string | null;
  orderIndex: number;
  type: CourseContentItemType;
  title: string;
  content: string | null;
  fileUrl: string | null;
  totalSlides: number | null;
  presentationViewMode: string;
  isRequired: boolean;
  quiz: { maxAttempts: number; minCorrectAnswers: number } | null;
  survey: SurveyItemSpecification | null;
};

export interface ContentTransaction {
  findActiveModule(courseId: string, moduleId: string): Promise<{ id: string } | null>;
  findFirstActiveModule(courseId: string): Promise<{ id: string } | null>;
  nextModuleOrderIndex(courseId: string): Promise<number>;
  nextItemOrderIndex(courseId: string): Promise<number>;
  createModule(args: {
    courseId: string;
    title: string;
    description: string | null;
    orderIndex: number;
  }): Promise<{ id: string }>;
  updateModule(args: {
    moduleId: string;
    title: string;
    description: string | null;
  }): Promise<void>;
  archiveModule(courseId: string, moduleId: string, archivedAt: Date): Promise<void>;
  createItem(data: CreateContentItemData): Promise<{ id: string }>;
  findActiveItem(courseId: string, itemId: string): Promise<{
    id: string;
    type: CourseContentItemType;
  } | null>;
  updateItem(data: CourseCoverUpdate & {
    courseId: string;
    itemId: string;
    moduleId: string | null;
    title: string;
    content: string | null;
    fileUrl: string | null;
    totalSlides: number | null;
    presentationViewMode: string;
    isRequired: boolean;
  }): Promise<void>;
  archiveItem(courseId: string, itemId: string, archivedAt: Date): Promise<boolean>;
  loadOrdering(courseId: string): Promise<{
    moduleIds: string[];
    items: Array<{ id: string; moduleId: string | null }>;
  }>;
  updateItemOrder(items: Array<{ id: string; orderIndex: number }>): Promise<void>;
  markContentChanged(courseId: string): Promise<void>;
  findQuiz(courseId: string, quizId: string): Promise<{ id: string } | null>;
  updateQuizSettings(args: {
    quizId: string;
    maxAttempts: number;
    minCorrectAnswers: number;
    timeLimitMinutes: number | null;
    shuffleQuestions: boolean;
    shuffleAnswers: boolean;
    lockMaterialsOnStart: boolean;
  }): Promise<void>;
  nextQuestionOrderIndex(quizId: string): Promise<number>;
  createQuestion(args: {
    quizId: string;
    orderIndex: number;
    type: string;
    prompt: string;
    config: string;
    points: number;
  }): Promise<void>;
  archiveQuestion(courseId: string, questionId: string, archivedAt: Date): Promise<boolean>;
}

export interface ContentRepository {
  transact<T>(execute: (transaction: ContentTransaction) => Promise<T>): Promise<T>;
}

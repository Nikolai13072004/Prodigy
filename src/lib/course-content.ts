import type { Course, CourseItem, CourseModule, Question, Quiz } from "@prisma/client";
import { normalizePresentationViewMode } from "@/lib/constants";

type SnapshotCourseLike = Pick<
  Course,
  | "title"
  | "description"
  | "requirements"
  | "targetAudience"
  | "category"
  | "difficultyLevel"
  | "durationMinutes"
  | "tagsJson"
  | "thumbnailUrl"
  | "coverUrl"
  | "navigationMode"
  | "quizGateMode"
  | "completionMode"
  | "statusFormat"
  | "gradedItemIdsJson"
  | "resultViewMode"
>;

type SnapshotModuleLike = Pick<CourseModule, "id" | "title" | "description" | "orderIndex" | "archivedAt">;
type SnapshotQuestionLike = Pick<
  Question,
  "id" | "orderIndex" | "type" | "prompt" | "config" | "points" | "archivedAt"
>;
type SnapshotQuizLike = Pick<
  Quiz,
  | "id"
  | "description"
  | "maxAttempts"
  | "minCorrectAnswers"
  | "timeLimitMinutes"
  | "shuffleQuestions"
  | "shuffleAnswers"
  | "lockMaterialsOnStart"
  | "questionPoolSize"
  | "retryDelayMinutes"
  | "trackSecurityEvents"
> & {
  questions: SnapshotQuestionLike[];
};
type SnapshotItemLike = Pick<
  CourseItem,
  | "id"
  | "moduleId"
  | "orderIndex"
  | "type"
  | "title"
  | "content"
  | "fileUrl"
  | "totalSlides"
  | "presentationViewMode"
  | "isRequired"
  | "archivedAt"
> & {
  quiz: SnapshotQuizLike | null;
};

export type PublishedCourseSnapshotQuestion = {
  id: string;
  orderIndex: number;
  type: string;
  prompt: string;
  config: string;
  points: number;
};

export type PublishedCourseSnapshotQuiz = {
  id: string;
  description: string | null;
  maxAttempts: number;
  minCorrectAnswers: number;
  timeLimitMinutes: number | null;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  lockMaterialsOnStart: boolean;
  questionPoolSize: number | null;
  retryDelayMinutes: number | null;
  trackSecurityEvents: boolean;
  questions: PublishedCourseSnapshotQuestion[];
};

export type PublishedCourseSnapshotModule = {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
};

export type PublishedCourseSnapshotItem = {
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
  quiz: PublishedCourseSnapshotQuiz | null;
};

export type PublishedCourseSnapshot = SnapshotCourseLike & {
  modules: PublishedCourseSnapshotModule[];
  items: PublishedCourseSnapshotItem[];
};

export type CourseModuleGroup<TItem> = {
  id: string | null;
  title: string;
  description: string | null;
  orderIndex: number;
  isSynthetic: boolean;
  items: TItem[];
};

export function isPublishedSnapshotActive(course: {
  status: string;
  hasUnpublishedChanges: boolean;
  publishedSnapshotJson: string | null;
}) {
  return course.status === "PUBLISHED" && course.hasUnpublishedChanges && Boolean(course.publishedSnapshotJson);
}

export function compareCourseItems(
  left: Pick<PublishedCourseSnapshotItem, "orderIndex" | "title" | "id">,
  right: Pick<PublishedCourseSnapshotItem, "orderIndex" | "title" | "id">
) {
  if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex;
  if (left.title !== right.title) return left.title.localeCompare(right.title, "ru");
  return left.id.localeCompare(right.id, "ru");
}

export function compareCourseModules(
  left: Pick<PublishedCourseSnapshotModule, "orderIndex" | "title" | "id">,
  right: Pick<PublishedCourseSnapshotModule, "orderIndex" | "title" | "id">
) {
  if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex;
  if (left.title !== right.title) return left.title.localeCompare(right.title, "ru");
  return left.id.localeCompare(right.id, "ru");
}

export function sortCourseItems<T extends Pick<PublishedCourseSnapshotItem, "orderIndex" | "title" | "id">>(
  items: T[]
) {
  return items.slice().sort(compareCourseItems);
}

export function sortCourseModules<
  T extends Pick<PublishedCourseSnapshotModule, "orderIndex" | "title" | "id">
>(modules: T[]) {
  return modules.slice().sort(compareCourseModules);
}

export function buildCourseModuleGroups<
  TModule extends Pick<PublishedCourseSnapshotModule, "id" | "title" | "description" | "orderIndex">,
  TItem extends Pick<PublishedCourseSnapshotItem, "id" | "moduleId" | "orderIndex" | "title">
>(args: {
  modules: TModule[];
  items: TItem[];
  uncategorizedTitle?: string;
  includeEmptyModules?: boolean;
}) {
  const uncategorizedTitle = args.uncategorizedTitle ?? "Без модуля";
  const includeEmptyModules = args.includeEmptyModules ?? true;
  const sortedModules = sortCourseModules(args.modules);
  const sortedItems = sortCourseItems(args.items);
  const itemsByModuleId = new Map<string | null, TItem[]>();

  for (const item of sortedItems) {
    const key = item.moduleId ?? null;
    const bucket = itemsByModuleId.get(key) ?? [];
    bucket.push(item);
    itemsByModuleId.set(key, bucket);
  }

  const groups: CourseModuleGroup<TItem>[] = [];

  for (const courseModule of sortedModules) {
    const items = itemsByModuleId.get(courseModule.id) ?? [];
    if (!includeEmptyModules && items.length === 0) continue;

    groups.push({
      id: courseModule.id,
      title: courseModule.title,
      description: courseModule.description,
      orderIndex: courseModule.orderIndex,
      isSynthetic: false,
      items,
    });
    itemsByModuleId.delete(courseModule.id);
  }

  const uncategorizedItems = itemsByModuleId.get(null) ?? [];
  if (uncategorizedItems.length > 0 || (includeEmptyModules && groups.length === 0)) {
    const fallbackOrderIndex = groups.length > 0 ? Math.max(...groups.map((group) => group.orderIndex)) + 1 : 0;
    groups.push({
      id: null,
      title: uncategorizedTitle,
      description: null,
      orderIndex: fallbackOrderIndex,
      isSynthetic: true,
      items: uncategorizedItems,
    });
  }

  return groups;
}

export function buildPublishedCourseSnapshot(args: SnapshotCourseLike & {
  modules: SnapshotModuleLike[];
  items: SnapshotItemLike[];
}): PublishedCourseSnapshot {
  const modules = sortCourseModules(
    args.modules
      .filter((module) => !module.archivedAt)
      .map((module) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        orderIndex: module.orderIndex,
      }))
  );

  const items = sortCourseItems(
    args.items
      .filter((item) => !item.archivedAt)
      .map((item) => ({
        id: item.id,
        moduleId: item.moduleId,
        orderIndex: item.orderIndex,
        type: item.type,
        title: item.title,
        content: item.content,
        fileUrl: item.fileUrl,
        totalSlides: item.totalSlides,
        presentationViewMode: normalizePresentationViewMode(item.presentationViewMode),
        isRequired: item.isRequired,
        quiz: item.quiz
          ? {
              id: item.quiz.id,
	              description: item.quiz.description,
	              maxAttempts: item.quiz.maxAttempts,
	              minCorrectAnswers: item.quiz.minCorrectAnswers,
	              timeLimitMinutes: item.quiz.timeLimitMinutes,
	              shuffleQuestions: item.quiz.shuffleQuestions,
	              shuffleAnswers: item.quiz.shuffleAnswers,
	              lockMaterialsOnStart: item.quiz.lockMaterialsOnStart,
	              questionPoolSize: item.quiz.questionPoolSize,
	              retryDelayMinutes: item.quiz.retryDelayMinutes,
	              trackSecurityEvents: item.quiz.trackSecurityEvents,
	              questions: item.quiz.questions
                .filter((question) => !question.archivedAt)
                .slice()
                .sort((left, right) => left.orderIndex - right.orderIndex)
                .map((question) => ({
                  id: question.id,
                  orderIndex: question.orderIndex,
                  type: question.type,
                  prompt: question.prompt,
                  config: question.config,
                  points: question.points,
                })),
            }
          : null,
      }))
  );

  return {
    title: args.title,
    description: args.description,
    requirements: args.requirements,
    targetAudience: args.targetAudience,
    category: args.category,
    difficultyLevel: args.difficultyLevel,
    durationMinutes: args.durationMinutes,
    tagsJson: args.tagsJson,
    thumbnailUrl: args.thumbnailUrl,
    coverUrl: args.coverUrl,
    navigationMode: args.navigationMode,
    quizGateMode: args.quizGateMode,
    completionMode: args.completionMode,
    statusFormat: args.statusFormat,
    gradedItemIdsJson: args.gradedItemIdsJson,
    resultViewMode: args.resultViewMode,
    modules,
    items,
  };
}

export function parsePublishedCourseSnapshot(
  snapshotJson: string | null | undefined
): PublishedCourseSnapshot | null {
  if (!snapshotJson) return null;

  try {
    const parsed = JSON.parse(snapshotJson) as PublishedCourseSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.modules)) return null;
    return {
      ...parsed,
      quizGateMode: parsed.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
      items: sortCourseItems(
        parsed.items.map((item) => ({
          ...item,
          presentationViewMode:
            normalizePresentationViewMode(item.presentationViewMode),
        }))
      ),
      modules: sortCourseModules(parsed.modules),
    };
  } catch {
    return null;
  }
}

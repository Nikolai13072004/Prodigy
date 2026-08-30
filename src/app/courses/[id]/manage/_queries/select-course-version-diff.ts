import { parsePublishedCourseSnapshot } from "@/lib/course-content";

export function selectCourseVersionDiff(course: {
  title: string;
  description: string | null;
  navigationMode: string;
  quizGateMode: string;
  resultViewMode: string;
  publishedSnapshotJson: string | null;
  modules: Array<{ id: string; title: string; description: string | null; orderIndex: number }>;
  items: Array<{
    id: string;
    title: string;
    type: string;
    isRequired: boolean;
    orderIndex: number;
    moduleId: string | null;
    quiz: { questions: Array<{ id: string }> } | null;
  }>;
}) {
  const snapshot = parsePublishedCourseSnapshot(course.publishedSnapshotJson);
  if (!snapshot) return [];

  const changes: string[] = [];
  if (snapshot.title !== course.title) changes.push(`Название: «${snapshot.title}» → «${course.title}»`);
  if ((snapshot.description ?? "") !== (course.description ?? "")) changes.push("Описание курса изменено.");
  if (snapshot.navigationMode !== course.navigationMode) changes.push("Изменен режим прохождения курса.");
  if ((snapshot.quizGateMode ?? "RESOLVED") !== course.quizGateMode) changes.push("Изменено условие открытия следующего этапа после теста.");
  if (snapshot.resultViewMode !== course.resultViewMode) changes.push("Изменен режим показа результата.");

  const snapshotModules = new Map(snapshot.modules.map((module) => [module.id, module]));
  const currentModules = new Map(course.modules.map((module) => [module.id, module]));
  for (const courseModule of course.modules) {
    const previous = snapshotModules.get(courseModule.id);
    if (!previous) changes.push(`Добавлен раздел «${courseModule.title}».`);
    else if (previous.title !== courseModule.title || previous.description !== courseModule.description) {
      changes.push(`Изменен раздел «${courseModule.title}».`);
    }
  }
  for (const courseModule of snapshot.modules) {
    if (!currentModules.has(courseModule.id)) changes.push(`Удален раздел «${courseModule.title}».`);
  }

  const snapshotItems = new Map(snapshot.items.map((item) => [item.id, item]));
  const currentItems = new Map(course.items.map((item) => [item.id, item]));
  for (const item of course.items) {
    const previous = snapshotItems.get(item.id);
    if (!previous) {
      changes.push(`Добавлен материал «${item.title}».`);
      continue;
    }

    const previousQuestionCount = previous.quiz?.questions.length ?? 0;
    const currentQuestionCount = item.quiz?.questions.length ?? 0;
    if (
      previous.title !== item.title ||
      previous.type !== item.type ||
      previous.isRequired !== item.isRequired ||
      previous.moduleId !== item.moduleId ||
      previousQuestionCount !== currentQuestionCount
    ) {
      changes.push(`Изменен материал «${item.title}».`);
    }
  }
  for (const item of snapshot.items) {
    if (!currentItems.has(item.id)) changes.push(`Удален материал «${item.title}».`);
  }

  return changes.slice(0, 40);
}

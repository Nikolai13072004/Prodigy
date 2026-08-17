export type CourseProgressionItem = {
  id: string;
  type: string;
};

export type CourseProgressionPlan = {
  navigationMode: "FREE" | "SEQUENTIAL";
  quizGateMode: "RESOLVED" | "PASSED";
  completionMode: "ALL_ITEMS" | "REQUIRED_ITEMS";
  statusFormat: "COMPLETED_ONLY" | "PASSED_WITH_SCORE";
  requiredItemIds: string[];
  gradedItemIds: string[];
};

export class CourseProgressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseProgressionError";
  }
}

export function planCourseProgression(args: {
  items: CourseProgressionItem[];
  navigationMode: string;
  quizGateMode: string;
  completionMode: string;
  statusFormat: string;
  requestedRequiredItemIds: string[];
  requestedGradedItemIds: string[];
}): CourseProgressionPlan {
  const navigationMode = oneOf(args.navigationMode, ["FREE", "SEQUENTIAL"] as const, "Выберите корректный режим прохождения.");
  const quizGateMode = oneOf(args.quizGateMode, ["RESOLVED", "PASSED"] as const, "Выберите корректное условие открытия следующего этапа после теста.");
  const completionMode = oneOf(args.completionMode, ["ALL_ITEMS", "REQUIRED_ITEMS"] as const, "Выберите корректное условие завершения курса.");
  const requestedStatusFormat = oneOf(args.statusFormat, ["COMPLETED_ONLY", "PASSED_WITH_SCORE"] as const, "Выберите корректный формат статуса курса.");

  const itemIds = new Set(args.items.map((item) => item.id));
  const requiredItemIds = completionMode === "ALL_ITEMS"
    ? args.items.map((item) => item.id)
    : uniqueExistingIds(args.requestedRequiredItemIds, itemIds);
  if (args.items.length > 0 && requiredItemIds.length === 0) {
    throw new CourseProgressionError("Выберите хотя бы один обязательный материал.");
  }

  const requiredIds = new Set(requiredItemIds);
  const gradableIds = new Set(
    args.items
      .filter((item) => requiredIds.has(item.id) && isGradable(item.type))
      .map((item) => item.id),
  );
  const requestedGradedIds = uniqueExistingIds(args.requestedGradedItemIds, gradableIds);

  if (gradableIds.size === 0) {
    return {
      navigationMode,
      quizGateMode,
      completionMode,
      statusFormat: "COMPLETED_ONLY",
      requiredItemIds,
      gradedItemIds: [],
    };
  }
  if (requestedStatusFormat === "PASSED_WITH_SCORE" && requestedGradedIds.length === 0) {
    throw new CourseProgressionError("Выберите хотя бы один оцениваемый материал для подсчета баллов.");
  }

  return {
    navigationMode,
    quizGateMode,
    completionMode,
    statusFormat: requestedStatusFormat,
    requiredItemIds,
    gradedItemIds: requestedStatusFormat === "PASSED_WITH_SCORE" ? requestedGradedIds : [],
  };
}

function isGradable(type: string) {
  return type === "QUIZ";
}

function uniqueExistingIds(values: string[], allowed: Set<string>) {
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

function oneOf<const T extends readonly string[]>(value: string, allowed: T, message: string): T[number] {
  if (!allowed.includes(value)) throw new CourseProgressionError(message);
  return value as T[number];
}

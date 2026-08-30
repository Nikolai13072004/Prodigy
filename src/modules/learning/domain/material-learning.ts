export const MATERIAL_LEARNING_EVENT_TYPES = [
  "MATERIAL_OPENED",
  "MATERIAL_COMPLETED",
  "PRESENTATION_PAGE_VIEWED",
] as const;

export type MaterialLearningEventType = (typeof MATERIAL_LEARNING_EVENT_TYPES)[number];

export type MaterialLearningEvent =
  | { type: "MATERIAL_OPENED" }
  | { type: "MATERIAL_COMPLETED" }
  | { type: "PRESENTATION_PAGE_VIEWED"; page: number };

export type MaterialLearningStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type MaterialLearningProjection = {
  progressPercent: number;
  maxPageSeen: number;
  totalPages: number;
  viewedPages: number[];
  status: MaterialLearningStatus;
  completed: boolean;
};

export type MaterialLearningStateDto = Omit<MaterialLearningProjection, "viewedPages">;

type MaterialDescriptor = {
  type: string;
  totalPages: number;
};

type PreviousProjection = {
  progressPercent?: number | null;
  maxPageSeen?: number | null;
  totalPages?: number | null;
  viewedPages?: number[] | null;
} | null;

export class MaterialLearningDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialLearningDomainError";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizePages(values: number[] | null | undefined, totalPages: number) {
  return [...new Set((values ?? [])
    .filter((value) => Number.isInteger(value))
    .map((value) => clamp(value, 1, totalPages)))]
    .sort((left, right) => left - right);
}

function legacyViewedPages(previous: PreviousProjection, totalPages: number) {
  const explicitPages = normalizePages(previous?.viewedPages, totalPages);
  if (explicitPages.length > 0) return explicitPages;

  const maxPageSeen = clamp(Math.floor(previous?.maxPageSeen ?? 0), 0, totalPages);
  return Array.from({ length: maxPageSeen }, (_, index) => index + 1);
}

function statusFromPercent(progressPercent: number): MaterialLearningStatus {
  if (progressPercent >= 100) return "COMPLETED";
  if (progressPercent > 0) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export function projectMaterialLearningEvent(args: {
  material: MaterialDescriptor;
  previous: PreviousProjection;
  event: MaterialLearningEvent;
}): MaterialLearningProjection {
  const totalPages = Math.max(Math.floor(args.material.totalPages), 1);
  const previousProgress = clamp(Math.floor(args.previous?.progressPercent ?? 0), 0, 100);
  let viewedPages = legacyViewedPages(args.previous, totalPages);
  let progressPercent = previousProgress;

  if (args.event.type === "MATERIAL_OPENED") {
    progressPercent = Math.max(previousProgress, 1);
  }

  if (args.event.type === "PRESENTATION_PAGE_VIEWED") {
    if (args.material.type !== "PDF") {
      throw new MaterialLearningDomainError("Событие просмотра страницы допустимо только для презентации.");
    }
    const page = clamp(Math.floor(args.event.page), 1, totalPages);
    viewedPages = normalizePages([...viewedPages, page], totalPages);
    progressPercent = Math.max(previousProgress, Math.round((viewedPages.length / totalPages) * 100));
  }

  if (args.event.type === "MATERIAL_COMPLETED") {
    if (args.material.type === "PDF") {
      throw new MaterialLearningDomainError("Презентация завершается только после просмотра всех страниц.");
    }
    progressPercent = 100;
  }

  const maxPageSeen = viewedPages.length > 0 ? Math.max(...viewedPages) : 0;
  const status = statusFromPercent(progressPercent);

  return {
    progressPercent,
    maxPageSeen,
    totalPages,
    viewedPages,
    status,
    completed: status === "COMPLETED",
  };
}

export function toMaterialLearningStateDto(projection: MaterialLearningProjection): MaterialLearningStateDto {
  return {
    progressPercent: projection.progressPercent,
    maxPageSeen: projection.maxPageSeen,
    totalPages: projection.totalPages,
    status: projection.status,
    completed: projection.completed,
  };
}

export function isMaterialLearningEvent(value: unknown): value is MaterialLearningEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<MaterialLearningEvent>;
  if (event.type === "MATERIAL_OPENED" || event.type === "MATERIAL_COMPLETED") return true;
  return event.type === "PRESENTATION_PAGE_VIEWED" && typeof event.page === "number" && Number.isFinite(event.page);
}

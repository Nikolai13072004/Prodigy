import { getBestAttempt, getCourseProgress } from "@/lib/course-progress";
import { buildUserDisplayName } from "@/lib/users";

// Иммутабельный снимок факта завершения курса (ADR-012). Страница сертификата
// рендерится ТОЛЬКО из него — никаких живых джойнов на Course/User, чтобы выданный
// документ не менялся при последующем редактировании курса.

export const CERTIFICATE_SNAPSHOT_FORMAT_VERSION = 1;

export type CertificateStageStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type CertificateSnapshotStage = {
  title: string;
  type: string;
  status: CertificateStageStatus;
};

export type CertificateSnapshot = {
  formatVersion: typeof CERTIFICATE_SNAPSHOT_FORMAT_VERSION;
  learner: {
    fullName: string;
    firstName: string;
    lastName: string | null;
    login: string;
  };
  course: {
    id: string;
    title: string;
    durationMinutes: number | null;
    category: string | null;
    statusFormat: string;
  };
  completion: {
    completedAt: string; // ISO
    requiredTotal: number;
    completedRequired: number;
    percent: number;
    scorePercent: number | null;
    stages: CertificateSnapshotStage[];
  };
  platform: {
    siteName: string;
    logoUrl: string | null;
  };
};

// Элемент курса в том виде, в каком его ждёт getCourseProgress, плюс maxScore на
// попытках — он нужен для расчёта балла и не входит в AttemptLike course-progress.
export type CertificateQuizAttempt = {
  outcome: string;
  correctAnswers: number;
  attemptNumber: number;
  score: number;
  maxScore: number;
  completedAt: Date;
};

export type CertificateCourseItem = {
  id: string;
  type: string;
  isRequired: boolean;
  title?: string | null;
  quiz?: {
    maxAttempts: number;
    minCorrectAnswers: number;
    attempts: CertificateQuizAttempt[];
  } | null;
  viewed?: boolean;
  materialProgress?: number;
};

export type BuildCertificateSnapshotInput = {
  learner: { name: string; firstName: string; lastName: string | null; login: string };
  course: {
    id: string;
    title: string;
    durationMinutes: number | null;
    category: string | null;
    statusFormat: string;
  };
  items: CertificateCourseItem[];
  completedAt: Date;
  platform: { siteName: string; logoUrl: string | null };
};

export function buildCertificateSnapshot(input: BuildCertificateSnapshotInput): CertificateSnapshot {
  // Прогресс строго по PASSED-шлюзу — тот же критерий, что и в правиле выдачи.
  const progress = getCourseProgress({ items: input.items, quizGateMode: "PASSED" });
  const typeById = new Map(input.items.map((item) => [item.id, item.type]));
  const fullName =
    buildUserDisplayName(input.learner.firstName, input.learner.lastName) || input.learner.name;

  return {
    formatVersion: CERTIFICATE_SNAPSHOT_FORMAT_VERSION,
    learner: {
      fullName,
      firstName: input.learner.firstName,
      lastName: input.learner.lastName,
      login: input.learner.login,
    },
    course: {
      id: input.course.id,
      title: input.course.title,
      durationMinutes: input.course.durationMinutes,
      category: input.course.category,
      statusFormat: input.course.statusFormat,
    },
    completion: {
      completedAt: input.completedAt.toISOString(),
      requiredTotal: progress.requiredTotal,
      completedRequired: progress.completedRequired,
      percent: progress.percent,
      scorePercent: computeCertificateScorePercent(input.items, input.course.statusFormat),
      stages: progress.stages.list.map((stage) => ({
        title: stage.label,
        type: typeById.get(stage.key) ?? "UNKNOWN",
        status: stage.status,
      })),
    },
    platform: {
      siteName: input.platform.siteName,
      logoUrl: input.platform.logoUrl,
    },
  };
}

// Балл на сертификате считается только для формата «Пройден, X%». Среднее по
// лучшим попыткам обязательных тестов — как в hr-course-analytics.
export function computeCertificateScorePercent(
  items: CertificateCourseItem[],
  statusFormat: string
): number | null {
  if (statusFormat !== "PASSED_WITH_SCORE") return null;

  const gradedQuizzes = items.filter((item) => item.isRequired && item.type === "QUIZ" && item.quiz);
  if (gradedQuizzes.length === 0) return null;

  const percents = gradedQuizzes.map((item) => {
    const best = getBestAttempt(item.quiz!.attempts);
    if (!best || best.maxScore <= 0) return 0;
    return (best.score / best.maxScore) * 100;
  });

  return Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length);
}

export function parseCertificateSnapshot(json: string): CertificateSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Сертификат: не удалось разобрать снимок.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Сертификат: снимок повреждён.");
  }

  const version = (parsed as { formatVersion?: unknown }).formatVersion;
  if (version !== CERTIFICATE_SNAPSHOT_FORMAT_VERSION) {
    throw new Error(`Сертификат: неподдерживаемая версия снимка (${String(version)}).`);
  }

  return parsed as CertificateSnapshot;
}

import { getCourseProgress } from "@/lib/course-progress";
import type { CertificateCourseItem } from "./certificate-snapshot";

// Правило выдачи сертификата (ADR-012). Чистая функция — покрывается юнит-тестами.

export type CertificateIssuanceReason =
  | "OK"
  | "NOT_ENROLLED"
  | "NO_REQUIRED_ITEMS"
  | "NOT_COMPLETED"
  | "QUIZ_NOT_PASSED";

export type CertificateEligibilityContext = {
  // назначен ли пользователь на курс учеником (прямо или через группу)
  isAssignedLearner: boolean;
  items: CertificateCourseItem[];
};

export type CertificateIssuanceDecision = {
  issue: boolean;
  reason: CertificateIssuanceReason;
};

export function decideCertificateIssuance(
  context: CertificateEligibilityContext
): CertificateIssuanceDecision {
  // 1. Только назначенный ученик — иначе менеджер в режиме превью получил бы сертификат.
  if (!context.isAssignedLearner) {
    return { issue: false, reason: "NOT_ENROLLED" };
  }

  // 2. Прогресс строго по PASSED-шлюзу: обязательный тест засчитывается только
  //    пройденным. По умолчанию Course.quizGateMode = "RESOLVED", а isResolved
  //    включает FAILED — без этого сертификат ушёл бы провалившему все тесты.
  const strict = getCourseProgress({ items: context.items, quizGateMode: "PASSED" });

  // 3. Курс без обязательных этапов не «завершается» никогда — явный отказ, а не
  //    молчаливое false, которое выглядело бы как необъяснимая невыдача.
  if (strict.requiredTotal === 0) {
    return { issue: false, reason: "NO_REQUIRED_ITEMS" };
  }

  if (strict.isCompleted) {
    return { issue: true, reason: "OK" };
  }

  // Различаем «провален обязательный тест» и «курс вообще не пройден»: если по
  // мягкому RESOLVED-шлюзу курс завершён, а по строгому — нет, разница ровно в
  // проваленном, но «решённом» тесте.
  const lenient = getCourseProgress({ items: context.items, quizGateMode: "RESOLVED" });
  if (lenient.isCompleted) {
    return { issue: false, reason: "QUIZ_NOT_PASSED" };
  }

  return { issue: false, reason: "NOT_COMPLETED" };
}

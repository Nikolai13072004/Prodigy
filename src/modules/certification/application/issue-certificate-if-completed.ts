import { OUTBOX_TOPICS, type CertificateIssuedEmailEvent } from "@/modules/outbox/domain/topics";
import { decideCertificateIssuance } from "../domain/certificate-eligibility";
import { buildCertificateSnapshot } from "../domain/certificate-snapshot";
import { CertificationApplicationError } from "./errors";
import type { CertificateRecord, CertificationRepository } from "./ports";

export type IssueCertificateVia = "LEARNING" | "ASSESSMENT_SUBMIT" | "ASSESSMENT_REVIEW" | "MANUAL";

export type IssueCertificateCommand = {
  userId: string;
  courseId: string;
  issuedVia: IssueCertificateVia;
  issuedById?: string | null;
  // MANUAL-выдача администратором обходит проверку завершённости.
  bypassEligibility?: boolean;
};

export type IssueCertificateResult =
  | { status: "ISSUED"; certificate: CertificateRecord }
  | { status: "ALREADY_ISSUED"; certificate?: CertificateRecord }
  | { status: "NOT_ELIGIBLE"; reason: string };

export type IssueCertificateIfCompletedDeps = {
  repository: CertificationRepository;
  generateSerial: () => string;
  now: () => Date;
  baseUrl: string;
};

export function createIssueCertificateIfCompleted(deps: IssueCertificateIfCompletedDeps) {
  const { repository, generateSerial, now, baseUrl } = deps;

  return async function issueCertificateIfCompleted(
    command: IssueCertificateCommand
  ): Promise<IssueCertificateResult> {
    try {
      return await repository.transact({
        courseId: command.courseId,
        userId: command.userId,
        execute: async (transaction) => {
          // Экономим запросы: если сертификат уже есть — выходим без записи.
          // Настоящую идемпотентность даёт перехват P2002 ниже.
          const existing = await transaction.findCertificate();
          if (existing) {
            return { status: "ALREADY_ISSUED", certificate: existing } satisfies IssueCertificateResult;
          }

          const context = await transaction.loadCompletionContext();
          if (!context) {
            if (command.bypassEligibility) {
              throw new CertificationApplicationError(
                "CONTEXT_NOT_FOUND",
                "Курс или пользователь не найдены для выдачи сертификата."
              );
            }
            return { status: "NOT_ELIGIBLE", reason: "CONTEXT_NOT_FOUND" } satisfies IssueCertificateResult;
          }

          if (!command.bypassEligibility) {
            const decision = decideCertificateIssuance({
              isAssignedLearner: context.isAssignedLearner,
              items: context.items,
            });
            if (!decision.issue) {
              return { status: "NOT_ELIGIBLE", reason: decision.reason } satisfies IssueCertificateResult;
            }
          }

          const serial = generateSerial();
          const snapshot = buildCertificateSnapshot({
            learner: context.learner,
            course: context.course,
            items: context.items,
            completedAt: context.completedAt,
            platform: context.platform,
          });

          const certificate = await transaction.createCertificate({
            serial,
            courseId: command.courseId,
            userId: command.userId,
            issuedVia: command.issuedVia,
            issuedById: command.issuedById ?? null,
            completedAt: context.completedAt,
            snapshotJson: JSON.stringify(snapshot),
          });

          const certificateUrl = `${baseUrl}/certificates/${serial}`;
          const outboxEvents: Array<{ topic: string; payload: unknown }> = [];

          // Письмо ставим в очередь только если есть кому его отправить: пустой
          // recipients уронил бы событие в DEAD (hasRecipients применяется ко всем топикам).
          if (context.learner.email) {
            const payload: CertificateIssuedEmailEvent = {
              recipients: [
                {
                  email: context.learner.email,
                  name: context.learner.name,
                  firstName: context.learner.firstName,
                },
              ],
              courseTitle: context.course.title,
              courseUrl: `${baseUrl}/courses/${command.courseId}`,
              certificateUrl,
              certificateSerial: serial,
              issuedAt: now().toISOString(),
            };
            outboxEvents.push({ topic: OUTBOX_TOPICS.CERTIFICATE_ISSUED_EMAIL, payload });
          }

          await transaction.recordEffects({
            outboxEvents,
            audit: command.issuedById
              ? {
                  actorId: command.issuedById,
                  actorLogin: null,
                  actorName: null,
                  action: "CERTIFICATE_ISSUED",
                  objectType: "Certificate",
                  objectId: certificate.id,
                  objectLabel: serial,
                  metadata: { issuedVia: command.issuedVia, courseId: command.courseId, userId: command.userId },
                }
              : undefined,
          });

          return { status: "ISSUED", certificate } satisfies IssueCertificateResult;
        },
      });
    } catch (error) {
      // Гонка двух параллельных выдач: одна выиграла уникальный индекс, вторая
      // получила P2002 — это и есть идемпотентность, а не ошибка.
      if (repository.isUniqueViolation(error)) {
        return { status: "ALREADY_ISSUED" };
      }
      throw error;
    }
  };
}

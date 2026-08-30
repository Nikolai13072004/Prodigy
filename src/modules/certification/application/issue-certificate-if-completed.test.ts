import assert from "node:assert/strict";
import { test } from "node:test";
import { OUTBOX_TOPICS, type CertificateIssuedEmailEvent } from "@/modules/outbox/domain/topics";
import { createIssueCertificateIfCompleted } from "./issue-certificate-if-completed";
import type {
  CertificateRecord,
  CertificationEffects,
  CertificationRepository,
  CertificationTransaction,
  CompletionContext,
  NewCertificate,
} from "./ports";

// Use-case выдачи. Проверяем через фейковый репозиторий (без Prisma):
// выдача, идемпотентность (findCertificate и P2002), отказ, абсолютный URL.

class FakeUniqueViolation extends Error {}

function completedContext(overrides: Partial<CompletionContext> = {}): CompletionContext {
  return {
    isAssignedLearner: true,
    completedAt: new Date("2026-08-25T10:00:00Z"),
    learner: { name: "Иван Петров", firstName: "Иван", lastName: "Петров", login: "ivan", email: "ivan@corp.ru" },
    course: { id: "c1", title: "Курс", durationMinutes: 60, category: null, statusFormat: "COMPLETED_ONLY", ownerId: "owner1" },
    items: [{ id: "m1", type: "TEXT", isRequired: true, title: "Материал", materialProgress: 100 }],
    platform: { siteName: "Smart LMS", logoUrl: null },
    ...overrides,
  };
}

function makeRepository(opts: {
  existing?: CertificateRecord | null;
  context?: CompletionContext | null;
  throwUniqueOnCreate?: boolean;
}) {
  const state = {
    created: [] as NewCertificate[],
    effects: [] as CertificationEffects[],
  };

  const repository: CertificationRepository = {
    async transact({ execute }) {
      const transaction: CertificationTransaction = {
        async findCertificate() {
          return opts.existing ?? null;
        },
        async loadCompletionContext() {
          return opts.context ?? null;
        },
        async createCertificate(data) {
          if (opts.throwUniqueOnCreate) throw new FakeUniqueViolation("duplicate");
          state.created.push(data);
          return {
            id: "cert-1",
            serial: data.serial,
            courseId: data.courseId,
            userId: data.userId,
            status: "ISSUED",
            issuedAt: new Date("2026-08-25T10:00:00Z"),
            snapshotJson: data.snapshotJson,
          };
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      };
      return execute(transaction);
    },
    isUniqueViolation(error) {
      return error instanceof FakeUniqueViolation;
    },
  };

  return { repository, state };
}

const DEPS = {
  generateSerial: () => "abcd1234ef567890",
  now: () => new Date("2026-08-25T10:00:00Z"),
  baseUrl: "https://lms.example",
};

const COMMAND = { userId: "u1", courseId: "c1", issuedVia: "LEARNING" as const };

test("первая выдача: ISSUED, один сертификат и ровно одно outbox-событие с абсолютным URL", async () => {
  const { repository, state } = makeRepository({ context: completedContext() });
  const issue = createIssueCertificateIfCompleted({ repository, ...DEPS });

  const result = await issue(COMMAND);
  assert.equal(result.status, "ISSUED");
  assert.equal(state.created.length, 1);
  assert.equal(state.effects.length, 1);
  assert.equal(state.effects[0].outboxEvents.length, 1);

  const event = state.effects[0].outboxEvents[0];
  assert.equal(event.topic, OUTBOX_TOPICS.CERTIFICATE_ISSUED_EMAIL);
  const payload = event.payload as CertificateIssuedEmailEvent;
  assert.equal(payload.certificateUrl, "https://lms.example/certificates/abcd1234ef567890", "URL абсолютный");
  assert.equal(payload.courseUrl, "https://lms.example/courses/c1");
  assert.equal(payload.recipients[0].email, "ivan@corp.ru");
});

test("повторный вызов при существующем сертификате: ALREADY_ISSUED без новых записей", async () => {
  const existing: CertificateRecord = {
    id: "cert-0",
    serial: "old",
    courseId: "c1",
    userId: "u1",
    status: "ISSUED",
    issuedAt: new Date("2026-08-01T00:00:00Z"),
    snapshotJson: "{}",
  };
  const { repository, state } = makeRepository({ existing, context: completedContext() });
  const result = await createIssueCertificateIfCompleted({ repository, ...DEPS })(COMMAND);

  assert.equal(result.status, "ALREADY_ISSUED");
  assert.equal(state.created.length, 0, "ничего не создано");
  assert.equal(state.effects.length, 0, "ни одного события");
});

test("гонка: P2002 при создании превращается в ALREADY_ISSUED, а не в исключение", async () => {
  const { repository } = makeRepository({ context: completedContext(), throwUniqueOnCreate: true });
  const result = await createIssueCertificateIfCompleted({ repository, ...DEPS })(COMMAND);
  assert.equal(result.status, "ALREADY_ISSUED");
});

test("не завершён: NOT_ELIGIBLE, ни сертификата, ни события", async () => {
  const notDone = completedContext({
    items: [{ id: "m1", type: "TEXT", isRequired: true, title: "Материал", materialProgress: 0 }],
  });
  const { repository, state } = makeRepository({ context: notDone });
  const result = await createIssueCertificateIfCompleted({ repository, ...DEPS })(COMMAND);

  assert.equal(result.status, "NOT_ELIGIBLE");
  assert.equal(state.created.length, 0);
  assert.equal(state.effects.length, 0);
});

test("без email ученика: сертификат выдаётся, но письмо не ставится в очередь", async () => {
  const noEmail = completedContext({
    learner: { name: "Без Почты", firstName: "Без", lastName: "Почты", login: "nomail", email: null },
  });
  const { repository, state } = makeRepository({ context: noEmail });
  const result = await createIssueCertificateIfCompleted({ repository, ...DEPS })(COMMAND);

  assert.equal(result.status, "ISSUED");
  assert.equal(state.created.length, 1);
  assert.equal(state.effects[0].outboxEvents.length, 0, "нет получателя — нет события");
});

test("MANUAL с bypassEligibility выдаёт даже незавершённый курс", async () => {
  const notDone = completedContext({
    items: [{ id: "m1", type: "TEXT", isRequired: true, title: "Материал", materialProgress: 0 }],
  });
  const { repository, state } = makeRepository({ context: notDone });
  const result = await createIssueCertificateIfCompleted({ repository, ...DEPS })({
    userId: "u1",
    courseId: "c1",
    issuedVia: "MANUAL",
    issuedById: "admin1",
    bypassEligibility: true,
  });

  assert.equal(result.status, "ISSUED");
  assert.equal(state.created.length, 1);
  assert.equal(state.created[0].issuedVia, "MANUAL");
  // выдача администратором фиксируется в аудите
  assert.equal(state.effects[0].audit?.action, "CERTIFICATE_ISSUED");
});

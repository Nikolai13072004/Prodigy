import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { processOutboxBatch } from "./process-outbox-events";

// Инфра-тест outbox-воркера против настоящей БД. Запуск: npm run test:infra.
// Файл идёт последним по алфавиту — чистим очередь в начале каждого теста без вреда другим.

after(async () => {
  await prisma.$disconnect();
});

test("валидное событие → PROCESSED и письмо в EmailJob", async () => {
  await prisma.outboxEvent.deleteMany({});
  await prisma.emailJob.deleteMany({});

  const event = await prisma.outboxEvent.create({
    data: {
      topic: "certification.certificate-issued-email.v1",
      status: "PENDING",
      payloadJson: JSON.stringify({
        recipients: [{ email: "learner@corp.ru", name: "Ученик", firstName: "Ученик" }],
        courseTitle: "Курс",
        courseUrl: "http://h/courses/c",
        certificateUrl: "http://h/certificates/s",
        certificateSerial: "s",
        issuedAt: "2026-08-25T10:00:00.000Z",
      }),
    },
  });

  const result = await processOutboxBatch(10);
  assert.ok(result.processed >= 1, "хотя бы одно событие обработано");

  const processed = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
  assert.equal(processed?.status, "PROCESSED");
  assert.equal(
    await prisma.emailJob.count({ where: { toEmail: "learner@corp.ru", template: "CERTIFICATE" } }),
    1,
    "письмо поставлено в очередь"
  );
});

test("событие без получателей → не PROCESSED (FAILED/DEAD)", async () => {
  await prisma.outboxEvent.deleteMany({});

  const event = await prisma.outboxEvent.create({
    data: {
      topic: "certification.certificate-issued-email.v1",
      status: "PENDING",
      payloadJson: JSON.stringify({ courseTitle: "Без получателей" }),
    },
  });

  const result = await processOutboxBatch(10);
  assert.ok(result.failed >= 1, "провал зафиксирован");

  const failed = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
  assert.ok(failed?.status === "FAILED" || failed?.status === "DEAD", `статус ${failed?.status}`);
});

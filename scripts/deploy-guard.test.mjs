import assert from "node:assert/strict";
import test from "node:test";
import { checkMigrationStrategy } from "./deploy-guard.mjs";

const OK_DOCKERFILE = `
FROM node:20.20-bookworm-slim AS runner
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && npm run db:wal && npm run start -- -p 3000 -H 0.0.0.0"]
`;

test("Dockerfile с `db push` проходит проверку", () => {
  assert.equal(checkMigrationStrategy(OK_DOCKERFILE).ok, true);
});

test("возврат `migrate deploy` блокируется", () => {
  const result = checkMigrationStrategy(OK_DOCKERFILE.replace("prisma db push", "prisma migrate deploy"));

  assert.equal(result.ok, false);
  assert.match(result.reason, /migrate deploy/);
});

test("упоминание `migrate deploy` в комментарии не роняет проверку", () => {
  const withComment = `
FROM node:20.20-bookworm-slim AS runner
# ВНИМАНИЕ: не заменять на prisma migrate deploy — упадёт с P3005.
CMD ["sh", "-c", "npx prisma db push && npm run start"]
`;

  assert.equal(checkMigrationStrategy(withComment).ok, true);
});

test("CMD, разбитый на несколько строк, всё равно проверяется", () => {
  const multiline = `
FROM node:20.20-bookworm-slim AS runner
CMD ["sh", "-c", "npx prisma \\
  migrate \\
  deploy && npm run start"]
`;

  assert.equal(checkMigrationStrategy(multiline).ok, false);
});

// Проверять `db push` где угодно в файле недостаточно: инвариант в том, что
// схема применяется НА СТАРТЕ контейнера. `db push` в builder-стадии на прод-базу
// не влияет, а релиз со схемной миграцией уедет на устаревшую базу.
test("`db push` вне стартовой команды не засчитывается", () => {
  const builderOnly = `
FROM node:20.20-bookworm-slim AS builder
RUN npx prisma db push
FROM node:20.20-bookworm-slim AS runner
CMD ["sh", "-c", "npm run start -- -p 3000"]
`;

  const result = checkMigrationStrategy(builderOnly);
  assert.equal(result.ok, false);
  assert.match(result.reason, /стартов/i);
});

test("`db push` в стартовой команде засчитывается даже при других стадиях", () => {
  const multistage = `
FROM node:20.20-bookworm-slim AS builder
RUN npm run build
FROM node:20.20-bookworm-slim AS runner
CMD ["sh", "-c", "npx prisma db push && npm run start -- -p 3000"]
`;

  assert.equal(checkMigrationStrategy(multistage).ok, true);
});

// Docker наследует CMD от базового образа стадии, а не от предыдущей стадии
// в файле. Финальная стадия без своей CMD получает команду своей базы —
// команда builder-стадии в итоговый образ не попадает.
test("финальная стадия без CMD не наследует команду предыдущей стадии", () => {
  const noFinalCmd = `
FROM node:20.20-bookworm-slim AS builder
CMD ["sh", "-c", "npx prisma db push && npm run start"]
FROM node:20.20-bookworm-slim AS runner
COPY --from=builder /app /app
`;

  const result = checkMigrationStrategy(noFinalCmd);
  assert.equal(result.ok, false);
});

test("финальная стадия, собранная поверх стадии с CMD, наследует её команду", () => {
  const inheritedFromStage = `
FROM node:20.20-bookworm-slim AS base
CMD ["sh", "-c", "npx prisma db push && npm run start"]
FROM base AS runner
COPY . /app
`;

  assert.equal(checkMigrationStrategy(inheritedFromStage).ok, true);
});

test("учитывается последняя CMD, а не первая", () => {
  const overridden = `
FROM node:20.20-bookworm-slim AS builder
CMD ["sh", "-c", "npx prisma db push && npm run start"]
FROM node:20.20-bookworm-slim AS runner
CMD ["npm", "run", "start"]
`;

  assert.equal(checkMigrationStrategy(overridden).ok, false);
});

test("Dockerfile без стратегии применения схемы блокируется", () => {
  const noStrategy = `
FROM node:20.20-bookworm-slim AS runner
CMD ["npm", "run", "start"]
`;

  const result = checkMigrationStrategy(noStrategy);
  assert.equal(result.ok, false);
  assert.match(result.reason, /db push/i);
});

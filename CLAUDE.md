# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Это не тот Next.js, который вы знаете

Версия 16.2.2 содержит breaking changes — API, конвенции и структура файлов могут
отличаться от того, что вы помните. Перед написанием кода читайте нужный гайд в
`node_modules/next/dist/docs/`. Обращайте внимание на deprecation-заметки.

## Параллельная работа

Над проектом могут одновременно работать несколько разработчиков и AI-агентов в
отдельных ветках через pull request в GitHub.

Из этого следует то, чего не видно по коду:

- **Перед началом работы проверяйте, что делают остальные:** `gh pr list` и
  `git fetch && git branch -r`. В проекте уже был случай, когда две ветки независимо
  переписывали один и тот же слой и потребовали отдельной интеграционной ветки.
- **Не коммитьте в `main` напрямую** — только через MR. `main` — то, что выкатывается.
- **Ветка может уехать под вами:** автор MR правит его по ходу ревью. Перед выводами
  о содержимом ветки делайте `git fetch`, а не полагайтесь на снимок часовой давности.
- **Чужой PR не правьте молча.** Если нашли дефект — комментарий в PR, а не push
  в чужую ветку без согласования.

Локального знания стека здесь недостаточно: то же изменение может уже быть сделано
в параллельной ветке, и это выясняется только через GitHub.

## Схема БД: PostgreSQL + `migrate deploy`

База — **PostgreSQL** (`provider = "postgresql"`), переезд с SQLite выполнен по
@docs/architecture/014-postgres-migration-plan.md. Схема применяется через
`prisma migrate deploy` поверх чистой истории миграций с baseline
`*_init_postgres`. Прежний запрет на `migrate deploy` (ADR-010, `db push` +
`deploy-guard`) **снят** — он относился к старой SQLite-базе без таблицы
`_prisma_migrations`; P3005 на свежей PG-истории не возникает. Старые
SQLite-миграции лежат в `prisma/migrations-sqlite-archive/` как исторический след,
на PG не применяются.

После любого изменения `schema.prisma` добавляйте миграцию (`prisma migrate dev`)
и проверяйте расхождение — то же самое делает CI отдельным шагом:

```bash
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

Локальная разработка и тесты тоже требуют PostgreSQL: поднимите контейнер
`postgres:16` и укажите `DATABASE_URL=postgresql://…` (инфра-тесты — через
`INFRA_DATABASE_URL`, см. `scripts/run-infra-tests.mjs`).

## Команды

```bash
npm run test:unit     # 111 unit-тестов (node:test через tsx); файлы ищет scripts/run-unit-tests.mjs
                      # обходом src/ и scripts/ — новый *.test.ts подхватывается сам
npm run lint          # чисто, без warning
npm run build         # prisma generate + next build
npm run dev:3002      # dev-сервер в фоне на 3002, лог в tmp/dev-server-3002.log
npm run db:check      # проверка рабочей БД и обязательных колонок
npm run test:e2e      # Playwright; требует установленного Chromium, в CI не гоняется
```

`.env` в репозиторий не коммитится. Для локальной работы нужен `DATABASE_URL`
(`file:./dev.db` — Prisma резолвит путь относительно `prisma/schema.prisma`).

## SMTP

Источник истины для реальной отправки почты — переменные окружения деплоя:
`EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_TLS_SERVERNAME`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` и OAuth-переменные, если включён OAuth2.

Не меняйте эти значения, не перезаписывайте их из админских настроек платформы и не
печатайте секреты. При проверке доставки используйте значения окружения напрямую,
если пользователь явно не просит проверить сохранённые админские настройки.

## Архитектура

Доменная логика вынесена в `src/modules/` (learning, assessment, enrollment, content,
course, outbox) со слоями domain / application / infrastructure. Server actions в
`src/app/actions/` разбиты по областям — общий `course-actions.ts` был декомпозирован,
не собирайте его обратно.

Решения зафиксированы в `docs/architecture/` (ADR 001–010) — читайте нужный ADR перед
изменением соответствующего слоя.

Уведомления идут через транзакционный outbox: событие пишется в `OutboxEvent` в одной
транзакции с бизнес-изменением, разгребает его `email-worker`. Не отправляйте почту
напрямую из server action.

## Хранилище файлов

Работайте через `src/lib/storage/` (`storage.put/get/stream/delete`), а не через `fs`
напрямую — там нормализация ключей и защита от выхода за корень.

Файлы дедуплицируются по `(area, sha256, sizeBytes, extension)` в таблице `StorageFile`.
Отсюда два правила:

- удаляя файл с диска, удаляйте и запись — осиротевшая запись ломает последующую
  загрузку того же содержимого (`deleteStorageFileRecord`);
- на дедуплицированный файл может ссылаться несколько материалов, поэтому удалять его
  можно только когда эта же операция его и создала (`deduplicated === false`).

## Деплой

Приложение публикуется через Traefik из docker-сети `traefik-public`. Конкретные
домены и адреса инфраструктуры задаются только через локальные переменные окружения.
Контейнер не публикует порт 3000 на host — не добавляйте `ports:` в
`docker-compose.yml`.

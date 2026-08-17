# ADR-010: схема прода накатывается через `prisma db push`, а не `migrate deploy`

## Статус

Принято (2026-08-15). Временное решение — пересматривается после baseline прод-базы.

## Контекст

В `prisma/migrations/` лежат 62 миграции, и по ним ведётся история изменений схемы.
При этом на проде схема с самого начала накатывалась командой `prisma db push` из
`CMD` в [`Dockerfile`](../../Dockerfile) — так делалось до появления каталога миграций
и продолжилось после.

`db push` приводит базу в соответствие со `schema.prisma` напрямую и **не создаёт
служебную таблицу `_prisma_migrations`**. Для `prisma migrate deploy` такая база
выглядит как непустая база без истории миграций, и он отказывается работать:

```text
Error: P3005
The database schema is not empty.
```

В MR !2 (`a0d653e`) `CMD` был переведён на `migrate deploy` — по существу правильно,
но без baseline существующей базы. Последствие проверено воспроизведением: `db push`
на чистой базе, затем `migrate deploy` на ней же даёт `P3005`.

Отказ не локальный. `CMD` собран через `&&`, поэтому падение миграции означает, что
`npm run start` не выполняется вообще — контейнер уходит в рестарт-луп. Следом
`healthcheck` в [`docker-compose.yml`](../../docker-compose.yml) метит сервис
`unhealthy`, а из-за `depends_on: condition: service_healthy` не стартуют
`email-worker` и `hr-notification-worker`. То есть одна строка в `Dockerfile`
кладёт весь стек, а не одну миграцию.

## Решение

`CMD` остаётся на `prisma db push` до тех пор, пока прод-база не получит baseline.

Проверено, что для текущего состояния это безопасно: `db push` со схемы `main`
на схему после MR !2 добавляет три новые таблицы (`LearningEvent`, `StorageFile`,
`OutboxEvent`) и не запрашивает подтверждения на потерю данных.

Каталог `prisma/migrations/` продолжает вестись: он остаётся источником истории
изменений и основой для будущего перехода. Расхождение между миграциями и
`schema.prisma` контролируется командой:

```bash
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

Переход на `migrate deploy` выполняется отдельной задачей и требует:

1. проверить состояние прода — `docker exec lms-course3-app npx prisma migrate status`;
2. если истории нет, пометить применённым каждую уже накатанную миграцию —
   `npx prisma migrate resolve --applied <имя_миграции>`;
3. только после этого менять `CMD` на `migrate deploy`.

Возврат `migrate deploy` без выполненного baseline защищён guard-джобой
`deploy-guard` из [`scripts/deploy-guard.mjs`](../../scripts/deploy-guard.mjs):
она валит пайплайн, если в `Dockerfile` появляется `migrate deploy`. Сама
проверка живёт в [`scripts/deploy-guard.mjs`](../../scripts/deploy-guard.mjs)
и покрыта тестами, запускается и локально — `node scripts/deploy-guard.mjs`.
Снимать guard следует тем же MR, которым выполняется baseline.

## Последствия

Прод продолжает подниматься предсказуемо, ценой того, что фактическое состояние
схемы определяется `schema.prisma`, а не последовательностью миграций. Пока
`migrate diff` зелёный, эти два источника эквивалентны — поэтому проверка drift
обязательна перед каждым релизом, меняющим схему.

`db push` при 62 миграциях выглядит как очевидная ошибка, и попытка «починить»
её на `migrate deploy` будет повторяться. Отсюда три уровня защиты: комментарий
рядом с `CMD` в `Dockerfile`, этот ADR и guard в CI.

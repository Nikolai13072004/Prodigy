# ADR-014: переезд с SQLite на PostgreSQL

## Статус

Принято (2026-09-02). Закрывает открытый вопрос волны E из
[ADR-013](013-target-architecture-and-backlog.md) и заменяет временное
решение [ADR-010](010-database-migration-strategy.md).

**Кодовая часть переезда выполнена (2026-09-03):** провайдер `postgresql`,
baseline `*_init_postgres` (старые SQLite-миграции в `prisma/migrations-sqlite-archive/`),
`Dockerfile` на `migrate deploy`, `postgres:16` в обоих compose, CI на PG,
`deploy-guard` снят, регистронезависимый поиск. Проверено на реальном PG 16
локально: drift — нет, lint чисто, unit 685, build ok, infra 169/169.
**Остаётся владельцу — боевое переключение** (перенос прод-данных в окно
обслуживания, см. runbook в шаге 5); это единственный прод-влияющий шаг.

## Контекст

Приложение работает на SQLite (`provider = "sqlite"`, `DATABASE_URL=file:...`).
Прод-схема накатывается через `prisma db push` (ADR-010), таблицы
`_prisma_migrations` в базе нет, `migrate deploy` заблокирован guard'ом.

Ключевое наблюдение — **профиль записи не соответствует SQLite**:

- В `docker-compose.yml` / `deploy/compose.yml` **пять процессов** делят одну
  БД-файл на общем томе: веб-приложение + `email-worker` +
  `hr-notification-worker` + `course-reminder-worker` +
  `hr-report-schedule-worker`. Все они пишут.
- Транзакционный outbox (ADR-005) обрабатывается воркером через
  optimistic-claim с токеном (`process-outbox-events.ts`) — это конкурентная
  запись по определению.
- SQLite сериализует **все** записи блокировкой на уровне БД. WAL
  (`npm run db:wal`) улучшает конкурентность чтения, но писатель по-прежнему
  один. Файловые локи SQLite поверх docker-тома ненадёжны.

Под нагрузкой это даёт `SQLITE_BUSY` и лок-контеншн — и выстрелит именно при
росте числа учеников (больше одновременных сдач/прогресса + воркеры), то есть
в самый неподходящий момент. ADR-013 фиксирует этот риск как открытый.

Дополнительно, уже сейчас:

- **Регистронезависимый поиск по кириллице сломан.** Поиск курсов —
  `{ title: { contains: q } }` без `mode: "insensitive"`. На SQLite `LIKE`
  регистронезависим только для ASCII, поэтому «бюджет» и «Бюджет» дают разный
  результат. `mode: "insensitive"` в Prisma **не поддерживается на SQLite** —
  только на PostgreSQL.
- `payloadJson` / `snapshotJson` / `permissionsJson` хранятся как `String`;
  на PG их можно перевести в `Json`/JSONB с индексируемыми запросами (не
  обязательно для перехода, но открывается).

## Решение

Перейти на **PostgreSQL**. Обоснование:

1. MVCC — конкурентная запись без глобальной блокировки; снимает
   `SQLITE_BUSY` для веб+воркеров+outbox.
2. `mode: "insensitive"` — чинит поиск по русскому тексту.
3. Нормальные бэкапы (`pg_dump`/WAL), репликация, пул соединений.
4. Переход — **чистый момент вернуть нормальные миграции**: на свежей PG
   `migrate deploy` работает с baseline, guard из ADR-010 снимается.

Цена (осознанная): +1 инфра-компонент, одноразовый перенос данных, правки
`Dockerfile`/compose/`DATABASE_URL`, ревизия пары типов.

## План переезда (пошагово, каждый шаг — отдельный MR, зелёный CI)

### Шаг 0. Подготовка (без прод-эффекта) — ВЫПОЛНЕНО ✓

**Провайдер-независимость подтверждена эмпирически (2026-09-02):** все **118
инфра-тестов прошли против настоящего PostgreSQL 16** (fail 0) без единого
изменения кода. Проверено, что весь слой репозиториев (транзакции, перехват
P2002/уникальных нарушений, upsert, каскады, аудит в одной транзакции)
работает на PG идентично SQLite. Сырого SQL в `src/` — 0, всё через Prisma-API.

Процедура (воспроизводима локально при запущенном Docker):

```bash
docker run -d --name lms-pg-test -e POSTGRES_PASSWORD=test -e POSTGRES_USER=lms \
  -e POSTGRES_DB=lmstest -p 55432:5432 postgres:16
# временная копия схемы с provider = "postgresql"
sed 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma > /tmp/schema.pg.prisma
export DATABASE_URL="postgresql://lms:test@localhost:55432/lmstest?schema=public"
npx prisma db push --schema=/tmp/schema.pg.prisma --skip-generate --accept-data-loss
npx prisma generate --schema=/tmp/schema.pg.prisma          # клиент под postgres
TSX_TSCONFIG_PATH=tsconfig.infra.json node_modules/.bin/tsx --test --test-concurrency=1 \
  $(find src -name '*.infra.test.ts' | sort)                # 118/118
npx prisma generate && docker rm -f lms-pg-test             # вернуть клиент под sqlite
```

PG-прогон заведён в `scripts/run-infra-tests.mjs`: при
`INFRA_DATABASE_URL=postgresql://...` раннер создаёт временную pg-схему,
`db push --force-reset` в указанную БД, генерирует клиент под postgres, гоняет
тесты и **возвращает клиент под sqlite** в cleanup. Дефолтный прогон (временная
SQLite) — без изменений.

```bash
docker run -d --name lms-pg-test -e POSTGRES_PASSWORD=test -e POSTGRES_USER=lms \
  -e POSTGRES_DB=lmstest -p 55432:5432 postgres:16
INFRA_DATABASE_URL="postgresql://lms:test@localhost:55432/lmstest?schema=public" \
  npm run test:infra            # 118/118, клиент возвращается под sqlite
```

### Шаг 1. Провайдер и schema — ВЫПОЛНЕНО ✓

- `datasource db { provider = "postgresql" }`.
- `DATABASE_URL` — формат `postgresql://user:pass@host:5432/db?schema=public&connection_limit=...`.
- **Старые 66 миграций в `prisma/migrations/` — на SQLite-диалекте, на PG не
  применятся.** Архивировать их (перенести в `prisma/migrations-sqlite-archive/`
  как исторический след) и сгенерировать **свежий baseline** от текущей схемы:
  `prisma migrate dev --name init_postgres` на чистой PG. Это сброс истории
  миграций под новый провайдер — штатно при смене диалекта.

### Шаг 2. Индексы + поиск (волна D)

**Индексы уже внесены** миграцией `20260902120000_add_hot_path_indexes`
(диалектно-нейтральный `CREATE INDEX`, работает и на SQLite, и на PG; при
baseline «с нуля» они попадут в init автоматически, т.к. baseline
генерируется из схемы):

- `CourseUserAssignment @@index([userId])` — «мои назначения» ученика
  (`where { userId }`; `@@unique([courseId, userId])` не покрывает, userId не
  leftmost).
- `GroupMembership @@index([userId])` — членство ученика в группах
  (`memberships { some { userId } }`; та же причина).
- `Course @@index([status, publishedAt])` — каталог
  (`where { status } orderBy publishedAt`).

Остаётся на PG (недоступно на SQLite):

- Поиск: `contains: q` → `contains: q, mode: "insensitive"` в местах поиска
  курсов/пользователей (`courses/_views/*`, HR-фильтры, users-groups).

Обоснование волны D — там же: значимого N+1 в кодовой базе нет (страницы
используют `Promise.all`, lib-агрегации — `include` + in-memory циклы,
outbox-цикл — намеренный claim; сырого SQL в `src/` — 0, всё через Prisma-API →
код провайдер-независим). Индексы дают эффект именно на PG/масштабе, но
безвредны на SQLite и вносятся заранее.

### Шаг 3. Инфраструктура (compose) — ВЫПОЛНЕНО ✓

- Добавить сервис `postgres:16` в `docker-compose.yml` и `deploy/compose.yml`
  с healthcheck (`pg_isready`) и именованным томом `pgdata` (заменяет
  БД-том SQLite).
- Веб и все 4 воркера → тот же `DATABASE_URL` (строка подключения PG),
  `depends_on: postgres: condition: service_healthy`.
- **Пул соединений:** 5 процессов × дефолтный пул Prisma могут исчерпать
  `max_connections` PG. Задать `connection_limit` в URL (например 5–10 на
  процесс) или ввести PgBouncer. Посчитать: сумма ≤ `max_connections − запас`.
- Убрать `npm run db:wal` из CMD (это SQLite-специфично).

### Шаг 4. Миграции на выкатке (снятие ADR-010) — ВЫПОЛНЕНО ✓

- `Dockerfile` CMD: `prisma db push` → `prisma migrate deploy` (на свежей PG
  с baseline это валидно; P3005 не возникает — база пустая, история с нуля).
- Снять/переписать `scripts/deploy-guard.mjs` — тем же MR, что и baseline
  (как предписывает ADR-010). Обновить статус ADR-010 на «заменён ADR-014».

### Шаг 5. Перенос прод-данных (одноразово, в окно обслуживания) — СКРИПТ ГОТОВ ✓

`scripts/migrate-sqlite-to-postgres.mjs` написан и **протестирован локально**
(dev.db → PG 16: 416 строк, сверка `count()` по всем 49 моделям — ОК):

- Два PrismaClient в одном процессе: sqlite-источник (дефолтный клиент) и
  pg-приёмник (генерируется в отдельный `output`, дефолтный клиент не трогает).
- Порядок копирования **выводится топологически из DMMF** (родители по FK —
  раньше), хардкод порядка не нужен. cuid-PK копируются как есть.
- Флаги: `--push` (накатить целевую схему для чистой БД), `--truncate`
  (идемпотентный повтор). Верификация — `count()` src vs dst по каждой модели.

```bash
# при поднятой целевой PG:
TARGET_DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" \
  node scripts/migrate-sqlite-to-postgres.mjs        # прод: схема уже накачена migrate deploy
```

#### Runbook боевого переключения (владелец, в окно обслуживания)

Новые переменные окружения деплоя (в `.env`, генерируется CI/CD):
`POSTGRES_PASSWORD` (обязателен), опционально `POSTGRES_USER` (деф. `lms`),
`POSTGRES_DB` (деф. `lms`), `DB_CONNECTION_LIMIT` (деф. 10). Строку `DATABASE_URL`
compose собирает сам из них — вручную задавать не нужно.

1. **Бэкап SQLite (до всего).** Снять копию тома с `dev.db` и `pg_dump`-совместимый
   снимок не нужен — достаточно файла БД: `docker run --rm -v learning_lms_data:/d
   -v "$PWD":/out alpine cp /d/dev.db /out/dev.db.bak`. Сохранить до подтверждённой
   стабильности PG.
2. **Maintenance.** Включить `/maintenance` (страница есть), чтобы прекратить запись
   из старого стека.
3. **Поднять только postgres из нового стека** (образ ещё старый): выкатить compose
   так, чтобы поднялся сервис `postgres` и прошёл healthcheck. Схему на него
   накатит приложение при старте (`migrate deploy`), но на шаге переноса удобнее
   накатить заранее: `DATABASE_URL=<pg> npx prisma migrate deploy`.
4. **Перенос данных.** С доступом к старому `dev.db` и новой PG:
   `TARGET_DATABASE_URL="postgresql://lms:<pass>@<host>:5432/lms?schema=public"
   node scripts/migrate-sqlite-to-postgres.mjs`. Скрипт сверяет `count()` по всем
   моделям и падает при расхождении.
5. **Переключить стек на новый образ** (`migrate deploy` на старте — no-op, схема
   уже есть; данные на месте). Дождаться healthcheck веб-сервиса и воркеров.
6. **Снять maintenance.** Прогнать смоук: вход, список курсов, прохождение,
   поиск по кириллице (`бюджет`/`Бюджет` — теперь регистронезависимо).

**Откат:** вернуть предыдущий `IMAGE_TAG`, `DATABASE_URL` на SQLite и том
`learning_lms_data`. Данные, записанные в PG за окно, при откате теряются —
поэтому окно записи держать коротким. Том SQLite и бэкап не удалять до
подтверждённой стабильности PG.

Для очень большого объёма — альтернатива `pgloader`, но Prisma-копия проще по
контролю FK/типов.

### Шаг 6. Follow-up (после стабилизации, необязательно к cutover)

- `String`-поля с JSON → `Json` (JSONB) там, где нужны запросы по содержимому.
- Ревизия сортировок по кириллице (PG ICU-коллации) — проверить порядок в
  списках курсов/учеников.

## Последствия и риски

- **Диалектные различия SQLite→PG.** Главное поведенческое: `contains`
  становится регистро**зависимым** по умолчанию (поэтому явный
  `mode: "insensitive"` в шаге 2 обязателен, иначе поиск изменит поведение в
  другую сторону). Даты/булевы абстрагирует Prisma.
- **Старые миграции невозможно переиспользовать** (SQLite SQL). Baseline с нуля
  под PG — задокументировано в шаге 1.
- **Пул соединений** — реальный риск при 5 процессах; посчитать до cutover.
- **Окно обслуживания** для переноса: запись в PG во время окна не должна идти
  из старого стека — сначала maintenance, потом копирование, потом переключение
  образа/compose.

## Откат

Cutover — это смена образа/compose. Откат: вернуть предыдущий `IMAGE_TAG`,
`DATABASE_URL` на SQLite и SQLite-том. Данные, записанные в PG за окно, при
откате теряются — поэтому cutover выполняется в maintenance-окне с коротким
окном записи. SQLite-том и дамп сохраняются до подтверждённой стабильности PG.

## Решения по инфраструктуре (делегированы инженерии, 2026-09-02)

- **Контейнер `postgres:16` в том же compose-стеке** (не managed): соответствует
  текущей self-hosted топологии (Traefik/compose), без внешнего вендора и
  доплаты. Managed — опция на будущее при росте.
- **`connection_limit` в URL, без PgBouncer на старте.** 5 процессов (веб + 4
  воркера) — задать `connection_limit` так, чтобы сумма ≤ `max_connections`
  Postgres (дефолт 100) с запасом, напр. по 10 на процесс = 50. PgBouncer —
  когда процессов/пик станет больше.
- **Окно обслуживания для cutover** выбирает владелец при выкатке — это
  единственный прод-влияющий шаг (флип провайдера + `migrate deploy` + перенос
  данных лендятся вместе одной выкаткой, откат — возврат образа/тома SQLite).

Остаётся владельцу: назначить окно cutover и подтвердить доступ к прод-данным
для одноразового переноса.

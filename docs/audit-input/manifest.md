# Корпоративный манифест и стандарт разработки бизнес-приложений

> **Версия:** 1.0  
> **Статус:** нормативный стандарт  
> **Дата проверки:** 2026-06-23  
> **Владелец:** архитектура / технический руководитель  
> **Область:** внутренние приложения, B2B SaaS, клиентские и e-commerce-приложения, AI-native-системы, workflow/event-driven-системы  
> **Модель эксплуатации:** self-hosted на VPS, Docker, без Kubernetes по умолчанию  
> **Заменяет:** «Манифест и стандарты разработки» v0.1

---

## Содержание

- **Основания и границы:** разделы 0–6.
- **Архитектура приложения:** разделы 7–20.
- **Delivery, эксплуатация и безопасность:** разделы 21–28.
- **AI, данные и масштабирование:** разделы 29–33.
- **Governance и контроль:** разделы 34–38.
- **Практические шаблоны:** приложения A–I.

---

## 0. Нормативный статус документа

Этот документ задаёт обязательные архитектурные и эксплуатационные правила. Он не является каталогом модных библиотек и не заменяет инженерное решение измеряемыми лозунгами.

Нормативные слова трактуются так:

- **ОБЯЗАН / ЗАПРЕЩЕНО** — требование блокирует архитектурное ревью или выпуск;
- **СЛЕДУЕТ** — отклонение допустимо только с зафиксированной причиной и владельцем риска;
- **МОЖЕТ** — допустимый вариант, не являющийся дефолтом;
- **ADR** — Architecture Decision Record: версия решения, контекст, альтернативы, последствия, владелец и дата пересмотра.

Версии фреймворков и инструментов **не фиксируются в этом документе**. Они фиксируются в отдельном обновляемом BOM — Bill of Materials. Проект ОБЯЗАН использовать поддерживаемую версию из BOM либо оформить исключение.

---

## 1. Манифест в одну фразу

**Одно бизнес-приложение = один модульный монолит-бэкенд, владеющий бизнес-правилами и данными, плюс отдельный фронтенд-контейнер, общающийся с бэкендом только через версионируемый API-контракт.**

Дополнительные worker-процессы допустимы, но не меняют модель владения: они используют те же модули приложения, не образуют скрытые микросервисы и не получают обходных прав к данным.

---

## 2. Цели и антицели

### 2.1. Цели

Стандарт должен:

1. позволять команде 1–5 человек предсказуемо выпускать и поддерживать несколько бизнес-приложений;
2. ограничивать количество технологий и stateful-компонентов;
3. обеспечивать проверяемую изоляцию тенантов, а не декларативное «RLS включён»;
4. делать релизы, миграции, восстановление и расследование инцидентов частью разработки;
5. задавать безопасные границы для AI-функций и AI-агентов разработки;
6. оставлять путь масштабирования без преждевременного перехода к микросервисам и Kubernetes.

### 2.2. Антицели

Стандарт не пытается:

- максимизировать количество используемых технологий;
- копировать архитектуру hyperscale-компаний;
- обещать high availability на одном VPS;
- скрывать SQL, сеть, очереди и отказ внешних систем за фреймворк-магией;
- выдавать контейнерную границу за полноценную границу безопасности;
- гарантировать «exactly once» там, где система фактически работает с повторами;
- передавать архитектурную ответственность AI-агенту.

---

## 3. Неизменяемые архитектурные инварианты

1. **Фронтенд и бэкенд — разные deployment units и разные контейнеры.** Публичный трафик входит через один reverse proxy.
2. **Единственный прикладной канал между фронтендом и бэкендом — API.** Фронтенд не подключается к PostgreSQL, очередям, Vault или внутренним сервисам данных.
3. **Авторитетные бизнес-решения выполняются на бэкенде.** Клиентская валидация, форматирование и optimistic UI допустимы только как UX и не являются доверенными.
4. **Бэкенд — modular monolith.** Модули имеют явные API, владельцев данных и направленные зависимости.
5. **PostgreSQL — основной system of record для бизнес-данных.** Для каждой внешней системы и производного хранилища явно определяется источник истины и процедура reconciliation/rebuild.
6. **Shared-schema multi-tenancy защищается PostgreSQL RLS и серверной авторизацией одновременно.** RLS не заменяет проверку действия над ресурсом.
7. **Один production golden path.** Docker Compose используется локально; production-развёртывание выполняется утверждённым способом из BOM. По умолчанию — Kamal на Docker-хостах.
8. **Kubernetes не является дефолтом.** Он вводится только отдельным ADR при доказанной операционной необходимости и наличии владельца платформы.
9. **Новый stateful-компонент запрещён без измеряемой причины.** Redis, NATS, Temporal, ClickHouse и отдельная vector DB не добавляются «на будущее».
10. **Build once, deploy many.** Один и тот же неизменяемый digest артефакта проходит stage и production.
11. **Миграции не запускаются автоматически при старте приложения.** Их применяет единственный управляемый deploy job.
12. **Бэкап без проверенного восстановления не считается бэкапом.**
13. **AI-вывод считается недоверенным вводом.** Модель не определяет права доступа, не получает неограниченные секреты и не выполняет опасные действия без политик и аудита.

---

## 4. Классы сервиса и эксплуатационные обязательства

Каждый проект до написания кода ОБЯЗАН получить класс сервиса. Нельзя выбрать архитектуру отказоустойчивости без RTO, RPO и допустимого окна недоступности.

| Класс | Пример | Цель доступности | RPO | RTO | Допустим один VPS | Минимум восстановления |
|---|---|---:|---:|---:|---|---|
| **C0 — прототип** | демо, внутренний эксперимент без production-данных | не задаётся | не задаётся | не задаётся | да | воспроизводимая сборка; данные считаются расходными |
| **C1 — внутренний** | admin, вспомогательная система | 99.0% в рабочее время | ≤ 24 ч | ≤ 8 ч | да, с явным принятием риска | offsite backup, квартальный restore drill |
| **C2 — бизнес-критичный** | B2B SaaS, e-commerce, revenue path | 99.5% в месяц | ≤ 15 мин | ≤ 2 ч | только как временное исключение | PITR, отдельный failure domain для копий, ежемесячный restore drill |
| **C3 — критичный** | платёжный/регуляторный workflow, остановка бизнеса | 99.9% в месяц | ≤ 5 мин | ≤ 30 мин | нет | standby/failover, два failure domain, on-call, регулярные DR-учения |

Правила:

- сервис на одном VPS **не может декларироваться как C3**;
- C2 на одном VPS допускается только на ограниченный период с владельцем риска и датой устранения;
- если команда не способна обеспечить обязательства класса, класс понижается либо эксплуатация покупается как внешняя услуга;
- SLO измеряется пользовательскими сигналами, а не только uptime контейнера.

---

## 5. Профили приложений

### 5.1. Внутренние / admin

Дефолт: React SPA + API + PostgreSQL. SSR не требуется. RLS обязателен при наличии нескольких организаций, подразделений с жёсткой изоляцией либо чувствительных строк.

Не допускается превращать внутренний интерфейс в обход авторизации: admin-операции используют те же серверные policy, отдельные разрешения и audit trail.

### 5.2. B2B SaaS

Обязательны:

- модель organization/tenant/membership;
- lifecycle тенанта: provision, active, suspended, deleting, deleted;
- shared-schema RLS либо документированная silo-модель;
- per-tenant quotas и noisy-neighbor controls;
- приглашения, offboarding, экспорт и удаление данных;
- billing state machine и reconciliation с провайдером;
- SSO/SCIM для enterprise-тарифа — через утверждённый IdP/провайдер, а не самописный enterprise IAM.

### 5.3. Клиентские / e-commerce

SPA не является автоматическим дефолтом. Выбор рендеринга определяется публичностью, CDN-кэшированием, первым экраном и индексируемостью:

- статичный маркетинг и каталог — SSG/ISR;
- персонализированный публичный интерфейс — SSR/BFF;
- закрытый кабинет — SPA;
- frontend server получает данные только из API и не подключается к БД.

Обязательны idempotency, webhook inbox, reconciliation заказов/платежей, защита от повторного списания, управление inventory race conditions и performance budget.

### 5.4. AI-native / агентские

AI является capability внутри приложения, а не оправданием отдельной архитектуры. Обязательны model gateway, versioned prompts, evals, cost limits, tool authorization, prompt-injection tests, human approval для опасных действий и полный audit цепочки model → tool → effect.

Python вводится отдельным worker-процессом только при реальной зависимости от Python/ML-экосистемы, inference или data pipeline.

### 5.5. Workflow / event-driven

Дефолт — PostgreSQL state machine + transactional jobs. Outbox применяется для публикации во внешнюю систему. Temporal/NATS/Kafka вводятся только по критериям раздела 19.

---

## 6. Golden path и утверждённый стек

### 6.1. Дефолтный профиль

| Слой | Дефолт | Примечание |
|---|---|---|
| Язык | TypeScript на поддерживаемом Node.js Active LTS | Python — изолированный worker при доказанной необходимости |
| Репозиторий | monorepo для одного приложения | deployment units остаются раздельными |
| Фронтенд | React + Vite SPA | SSR/SSG framework — capability pack для публичных приложений |
| Server state | обычный generated API client; TanStack Query при реальном кэшировании/инвалидации | не «всегда» |
| Client state | local state и URL сначала; Zustand при межкомпонентном состоянии | server state не дублируется |
| Формы | React Hook Form как утверждённый вариант | серверная валидация обязательна независимо от UI |
| Backend HTTP | Fastify + TypeScript | NestJS — утверждённая альтернатива для крупного модульного монолита через ADR |
| Архитектура | modular monolith, explicit composition root | без скрытых сетевых вызовов между модулями |
| БД | PostgreSQL | поддерживаемый major из BOM |
| Query layer | Drizzle + параметризованный SQL | SQL остаётся видимым и ревьюируемым |
| Миграции | immutable SQL-файлы в репозитории | генератор допустим, результат ревьюится человеком |
| API | REST + OpenAPI, code-first с зафиксированным artifact | generated client; breaking-diff gate |
| Валидация | Zod на серверной границе | фронтенд получает generated DTO/types, а не shared server schemas |
| Auth | Better Auth для обычного self-hosted auth, Authentik, Keycloak | enterprise SSO/SCIM — внешний IdP/WorkOS-подобный сервис |
| Async jobs | pg-boss / PostgreSQL-backed worker | отдельный worker-контейнер |
| Секреты | Vault Agent + Vault | SOPS — bootstrap/IaC; password manager — human secrets |
| Dev orchestration | Docker Compose | не production deploy mechanism |
| Production deploy | Kamal, закреплённый в BOM | один путь на организацию |
| Observability | JSON logs + metrics + error tracking; OTel context | tracing — sampled и обязательный для интеграций/async/AI |
| Тесты | Vitest + Testcontainers + Playwright | количество тестов не нормируется |
| Object storage | S3-compatible API | не хранить большие blobs в OLTP без ADR |

### 6.2. Capability packs

Capability pack — заранее описанное расширение golden path. Он не включается автоматически.

| Pack | Разрешён, когда | Обязательная цена решения |
|---|---|---|
| SSR/SSG frontend | публичный контент, CDN, TTFB, share previews | отдельный frontend runtime, cache policy, SSR failure mode |
| Python worker | ML/inference/data SDK недоступен или неразумен в TS | второй runtime, security scan, observability, deployment |
| Redis | shared cache, distributed rate limit/lock с доказанной нуждой | eviction policy, outage behavior, persistence decision |
| NATS JetStream | несколько независимых consumers, replay/fan-out, отдельные services | кластер и операционный владелец; single-node не считается HA |
| Temporal | workflows часы/дни, human-in-loop, compensation, durable resume | workflow versioning, idempotent activities, отдельная платформа |
| ClickHouse | постоянная OLAP ingestion/query нагрузка не помещается в replica/export | схема доставки, rebuild, backup, observability |
| Dedicated vector DB | pgvector не выполняет измеренные latency/recall/cost требования | новый источник производных данных и rebuild pipeline |
| Kubernetes | доказана необходимость scheduler/platform capabilities | выделенный platform owner и on-call |

### 6.3. Бюджет сложности

- По умолчанию приложение не добавляет ни одного собственного stateful-компонента кроме PostgreSQL.
- Object storage и Vault могут быть общими платформенными сервисами.
- Один дополнительный stateful-компонент требует ADR.
- Два и более дополнительных stateful-компонента требуют архитектурного ревью с эксплуатационной моделью, backup/restore и владельцем.
- «Возможно пригодится позже» не является основанием.

---

## 7. Структура репозитория и deployment units

Рекомендуемая структура:

```text
/apps
  /web                 # browser UI или SSR frontend; отдельный image
  /api                 # HTTP backend; отдельный image
  /worker              # jobs/workflows; отдельный command/image
/packages
  /api-client          # сгенерирован из OpenAPI
  /ui                  # дизайн-система без доменной логики
  /config              # typed config helpers, не секреты
  /test-support
/contracts
  openapi.yaml         # коммитится и diff-проверяется
/db
  /migrations
  /seeds
/ops
  /kamal
  /compose
  /runbooks
  /dashboards
/docs
  /adr
  /threat-models
```

Требования:

- фронтенд не импортирует backend domain/application packages;
- `api-client` генерируется из OpenAPI и не редактируется вручную;
- worker может использовать backend application modules, но не HTTP controller layer;
- один image МОЖЕТ запускаться разными командами для API и worker, если resource limits и lifecycle раздельны;
- production-артефакты воспроизводимы и не зависят от локального состояния разработчика.

---

## 8. Modular monolith: правила модулей

### 8.1. Модуль

Модуль соответствует bounded business capability, а не таблице или странице. Примеры: `identity`, `catalog`, `orders`, `billing`, `notifications`.

Рекомендуемая структура:

```text
src/modules/orders/
  domain/
  application/
  infrastructure/
  http/
  index.ts             # публичный API модуля
```

### 8.2. Зависимости

- модуль импортируется только через публичный `index.ts`/application API;
- циклические зависимости ЗАПРЕЩЕНЫ;
- прямой SQL к таблицам другого модуля ЗАПРЕЩЁН для write-path;
- cross-module read допускается через публичный query API либо специально созданную read model;
- shared-папка не должна становиться складом доменной логики;
- архитектурные тесты ОБЯЗАНЫ проверять запрещённые импорты.

### 8.3. Транзакции

- application service определяет границу бизнес-транзакции;
- HTTP controller, queue handler и cron adapter не владеют бизнес-транзакцией;
- событие во внешнюю систему публикуется после commit через outbox;
- сетевой вызов внутри открытой DB-транзакции ЗАПРЕЩЁН, кроме отдельно обоснованного короткого read-only случая;
- распределённая транзакция не используется; согласование выполняется через state machine, idempotency и reconciliation.

### 8.4. Что не требуется

- generic repository для каждой таблицы не обязателен;
- entity/aggregate не создаётся ради церемонии;
- DI container не является архитектурной целью;
- CQRS не вводится без разных read/write моделей и доказанной выгоды.

---

## 9. Граница фронтенда

Фронтенд отвечает за presentation logic:

- рендеринг, навигацию, доступность и локализацию;
- управление loading/error/empty states;
- клиентскую валидацию как UX;
- форматирование и presentation-specific derived values;
- optimistic update только с серверным подтверждением и откатом;
- безопасное хранение несекретного UI-state.

Фронтенду ЗАПРЕЩЕНО:

- принимать окончательное решение о разрешении операции;
- считать цену, скидку, комиссию, лимит или статус источником истины;
- обращаться к PostgreSQL, Vault, очередям или закрытым provider API;
- хранить секреты в bundle, runtime config или localStorage;
- доверять tenant/user/role, присланным клиентом;
- дублировать server state в глобальном store без причины.

### 9.1. SSR/BFF

Frontend server МОЖЕТ выполнять presentation orchestration, prefetch, CDN/cache coordination и auth bootstrap. При SSR он передаёт browser session backend-у по утверждённому внутреннему маршруту, но не выпускает собственные user/tenant/role claims. Ему ЗАПРЕЩЕНО:

- подключаться к БД;
- владеть доменными инвариантами;
- выпускать привилегии или роли;
- обходить публичный/внутренний API бэкенда.

### 9.2. Frontend security

- same-origin cookie не отменяет CSRF;
- обязательны CSP, корректное output encoding и запрет небезопасного HTML без sanitization;
- state-changing GET ЗАПРЕЩЁН;
- access token не хранится в localStorage для browser session flow;
- клиент не показывает stack traces и внутренние identifiers пользователю;
- UI скрывает недоступные действия, но сервер всё равно проверяет разрешение.

### 9.3. Доступность и производительность

- клиентские и B2B-приложения СЛЕДУЕТ проектировать минимум под WCAG 2.2 AA;
- публичное приложение ОБЯЗАНО иметь измеримый performance budget;
- большие таблицы используют server-side pagination/filtering;
- bundle, изображения и сторонние scripts контролируются budget-ами, заданными в service profile.

---

## 10. API и контракт

### 10.1. Модель контракта

Стандарт использует **contract-governed code-first**:

1. серверные schemas и endpoints генерируют OpenAPI artifact;
2. artifact коммитится в `/contracts/openapi.yaml`;
3. CI сравнивает его с main и блокирует breaking changes;
4. frontend client генерируется только из этого artifact;
5. ручное расхождение кода, artifact и клиента блокирует сборку.

Называть этот процесс «OpenAPI-first» ЗАПРЕЩЕНО: source of truth — код и проверяемый generated artifact.

### 10.2. Общие правила

- вход валидируется на сервере до вызова application service;
- nullability, optional fields и enum evolution задаются явно;
- неизвестные поля либо отклоняются, либо обрабатываются по общей политике; молчаливое поведение на разных endpoints запрещено;
- все timestamps передаются в ISO 8601 с timezone;
- деньги передаются как minor units + currency либо как точная decimal-строка; IEEE float для денег ЗАПРЕЩЁН;
- IDs непрозрачны для клиента;
- запрос получает `trace_id`/`request_id`;
- body, header и response limits задаются reverse proxy и приложением;
- каждый внешний вызов имеет deadline.

### 10.3. Ошибки

Ошибки соответствуют Problem Details for HTTP APIs и содержат стабильный машинный `code`:

```json
{
  "type": "https://errors.example.internal/order-already-paid",
  "title": "Order is already paid",
  "status": 409,
  "code": "ORDER_ALREADY_PAID",
  "trace_id": "01J...",
  "details": {
    "order_id": "..."
  }
}
```

- stack trace, SQL и secret values клиенту не возвращаются;
- `code` является частью контракта;
- validation errors имеют единый формат поля/пути/причины;
- внутренний текст ошибки не используется клиентом для логики.

### 10.4. Пагинация

- unbounded list endpoints ЗАПРЕЩЕНЫ;
- cursor pagination — дефолт для изменяемых или крупных наборов;
- offset допустим для небольших bounded admin-наборов;
- cursor непрозрачен и включает стабильный tie-breaker;
- максимальный page size ограничен сервером.

### 10.5. Idempotency и concurrency

- потенциально повторяемые денежные, provisioning и внешние write-операции ОБЯЗАНЫ принимать idempotency key;
- key привязывается к actor/tenant/operation и request fingerprint;
- повтор с тем же key и другим payload отклоняется;
- результат и срок хранения idempotency record определяются endpoint contract;
- конкурентное изменение ресурсов использует version/ETag/`If-Match`, unique constraints или явную блокировку;
- read-modify-write без защиты от lost update ЗАПРЕЩЁН для критичных данных.

### 10.6. Версионирование

- additive changes не требуют новой URL-версии;
- breaking public API change требует новой версии или согласованного migration window;
- удаление поля проходит announce → deprecate → observe → remove;
- event, job и webhook payload всегда имеют собственную schema version;
- enum расширяется так, чтобы старый клиент не падал на неизвестном значении;
- OpenAPI breaking-diff является blocking CI gate.

### 10.7. Streaming

- SSE — дефолт для server-to-browser AI/status streaming;
- disconnect клиента должен отменять downstream work, если результат больше никому не нужен;
- proxy buffering, idle timeout, heartbeat и max connection duration задаются явно;
- WebSocket вводится только при двустороннем real-time протоколе.

---

## 11. Backend и бизнес-логика

### 11.1. HTTP-слой

Controller/route handler обязан быть тонким:

1. разобрать и валидировать transport input;
2. установить trusted request context;
3. вызвать application use case;
4. преобразовать результат в transport response.

В controller ЗАПРЕЩЕНЫ:

- SQL и управление транзакциями;
- расчёт бизнес-правил;
- прямой вызов provider SDK;
- ручная проверка ролей, размазанная по endpoints;
- запуск fire-and-forget promise.

### 11.2. Request context

Trusted context создаётся только бэкендом после проверки session/token и включает минимум:

```ts
type RequestContext = {
  requestId: string;
  actorId: string | null;
  tenantId: string | null;
  sessionId: string | null;
  authMethod: "session" | "api_key" | "service_token" | "anonymous";
  permissionsSnapshot?: readonly string[];
  deadline: Date;
};
```

- `tenantId`, `actorId`, roles и permissions не принимаются из пользовательских headers;
- frontend/reverse proxy может передать request ID, но backend обязан валидировать или заменить его;
- context не хранится в mutable global state;
- фоновые задачи несут собственный сериализуемый context envelope.

### 11.3. Конфигурация

- конфигурация типизирована и валидируется до открытия listening socket;
- обязательный параметр без значения приводит к fail-fast;
- environment-specific branching в бизнес-коде ЗАПРЕЩЁН;
- секрет и обычная конфигурация разделены;
- значение по умолчанию для production-sensitive настройки должно быть безопасным;
- runtime config не может незаметно менять контракт данных или авторизацию.

### 11.4. Время, деньги и локали

- внутри системы время хранится в UTC как `timestamptz`;
- timezone пользователя/тенанта — отдельное бизнес-данное;
- календарная дата без времени хранится как `date`, а не midnight UTC;
- cron учитывает timezone, DST, missed-run и duplicate-run policy;
- деньги не хранятся в float;
- округление задаётся бизнес-правилом и тестируется;
- clock и random generator инъектируются в критичные use cases для воспроизводимых тестов.

---

## 12. PostgreSQL и модель данных

### 12.1. Роль PostgreSQL

PostgreSQL — основной system of record для транзакционных бизнес-данных. Search index, cache, vector index, analytics store и provider state считаются производными либо внешними системами с явно описанным reconciliation.

### 12.2. Обязательные правила схемы

- бизнес-инварианты, выражаемые `NOT NULL`, `CHECK`, `UNIQUE`, `FOREIGN KEY` или exclusion constraint, ОБЯЗАНЫ быть закреплены в БД;
- серверная валидация не заменяет constraints;
- soft delete не является дефолтом: `deleted_at` вводится только при бизнес-требовании;
- каскадное удаление применяется только после анализа blast radius;
- audit/history не строится на бесконтрольном копировании всей строки в application log;
- крупные binary objects хранятся в object storage;
- расширения PostgreSQL входят в allowlist BOM и обновляются как отдельные зависимости.

### 12.3. Индексы

- индекс проектируется под конкретный query pattern;
- правило «`tenant_id` всегда первый» ЗАПРЕЩЕНО как абсолют;
- `tenant_id` обычно является ведущей колонкой tenant-scoped B-tree, если запрос начинает фильтрацию с tenant;
- глобальные admin lookup, queue polling, time-range, BRIN, partial и vector indexes проектируются отдельно;
- каждый нетривиальный индекс имеет связанный запрос и проверенный план;
- неиспользуемые и дублирующие индексы удаляются после наблюдения;
- индексная стоимость записи и WAL учитывается наравне с latency чтения.

### 12.4. SQL и query review

Обязательный review требуется для:

- запросов к таблицам порядка 10 млн строк и выше;
- `JOIN` более чем трёх крупных таблиц;
- запросов без очевидного selective predicate;
- JSONB containment/full scan;
- vector search с metadata filter;
- массовых `UPDATE`/`DELETE`;
- запросов, выполняемых внутри job loop.

Для горячих путей сохраняется `EXPLAIN (ANALYZE, BUFFERS)` на representative dataset. План с production PII в репозиторий не коммитится.

### 12.5. Connection management

- каждый процесс имеет ограниченный pool;
- суммарный budget connections включает API, workers, migrations, admin и monitoring;
- pool acquisition имеет timeout и метрику wait time;
- приложение применяет backpressure, а не создаёт бесконечную очередь запросов к БД;
- PgBouncer вводится при измеренной необходимости или множестве replicas;
- при transaction pooling нельзя полагаться на session state между транзакциями;
- tenant context устанавливается только через `SET LOCAL`/transaction-local `set_config`.

### 12.6. Триггеры и stored procedures

- constraints, технический audit, generated columns и узкие data-integrity functions допустимы;
- скрытая бизнес-оркестрация в triggers ЗАПРЕЩЕНА без ADR;
- функция с `SECURITY DEFINER` требует отдельного security review, фиксированного `search_path` и минимальных grants;
- owner и runtime роли разделены.

---

## 13. Multi-tenancy и RLS

### 13.1. Модель изоляции

По умолчанию B2B SaaS использует shared database + shared schema + `tenant_id` + RLS. Альтернативы:

| Модель | Когда применять | Цена |
|---|---|---|
| Shared schema + RLS | большинство малых/средних tenants | сложность policy и noisy neighbor |
| Schema per tenant | редко; ограниченное число крупных tenants и tooling готов | migrations и connection/search path complexity |
| Database/silo per tenant | residency, contractual isolation, очень крупный tenant | provisioning, fleet migrations, backup и monitoring |

Решение о silo принимается по compliance, residency, blast radius и профилю нагрузки, а не по числу разработчиков.

Для действительно single-tenant C1-приложения RLS МОЖЕТ быть исключён по service profile и threat model. Как только одна схема обслуживает несколько недоверяющих друг другу tenants, RLS становится обязательным.

### 13.2. DB-роли

Минимальный набор:

- `app_owner` — NOLOGIN, владеет объектами;
- `app_migrator` — применяет утверждённые migrations, не используется runtime;
- `app_runtime` — LOGIN, `NOSUPERUSER`, `NOBYPASSRLS`, не владеет таблицами;
- `app_worker` — по умолчанию те же ограничения, что runtime;
- `app_breakglass` — временный доступ через процедуру, не постоянный общий пароль.

Runtime connection ЗАПРЕЩЕНО выдавать:

- `SUPERUSER`;
- `BYPASSRLS`;
- ownership tenant tables;
- DDL grants;
- unrestricted access к schema с секретными/служебными таблицами.

### 13.3. Transaction-local tenant context

Каждый tenant-scoped use case выполняется так:

```sql
BEGIN;
SELECT set_config('app.current_tenant', :tenant_id, true);
SELECT set_config('app.current_actor', :actor_id, true);
-- business queries
COMMIT;
```

Третий аргумент `true` делает значение transaction-local.

Правила:

- context устанавливает единый transaction wrapper до первого tenant query;
- context берётся только из проверенной membership/session;
- обращение к tenant table вне wrapper блокируется архитектурным тестом и code review;
- при отсутствии context policy должна закрывать доступ; middleware дополнительно генерирует явную ошибку;
- connection возвращается в pool только после завершения транзакции;
- cross-tenant batch использует отдельный административный use case, reason code и audit, а не подмену tenant в цикле без контроля.

### 13.4. Пример политики

```sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_select
ON public.orders
FOR SELECT
TO app_runtime, app_worker
USING (tenant_id = app.current_tenant_id());

CREATE POLICY orders_insert
ON public.orders
FOR INSERT
TO app_runtime, app_worker
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY orders_update
ON public.orders
FOR UPDATE
TO app_runtime, app_worker
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY orders_delete
ON public.orders
FOR DELETE
TO app_runtime, app_worker
USING (tenant_id = app.current_tenant_id());
```

Политики для разных операций задаются явно. Нельзя полагаться на случайную композицию нескольких permissive policies.

### 13.5. Авторизация поверх RLS

RLS отвечает преимущественно на вопрос «какие строки доступны этому tenant context». Application authorization отвечает на вопрос «может ли actor выполнить action над конкретным resource в текущем состоянии».

Decision contract:

```text
(actor, tenant, action, resource, context) -> allow | deny + reason
```

- role name не должен быть единственным API авторизации;
- ownership, delegation, resource state и separation of duties проверяются на application layer;
- решение deny является дефолтом;
- чувствительные deny events логируются без PII payload.

### 13.6. Обязательные tenant-тесты

Для каждой tenant table CI ОБЯЗАН проверять:

1. tenant A не читает tenant B;
2. tenant A не вставляет строку с `tenant_id = B`;
3. tenant A не меняет tenant ownership update-ом;
4. запрос без tenant context не видит и не изменяет строки;
5. runtime role не обходит RLS;
6. background job сохраняет tenant context;
7. admin cross-tenant path создаёт audit event;
8. unique constraints корректно учитывают tenant scope.

### 13.7. Lifecycle и quotas

Tenant model ОБЯЗАН включать:

- состояние и причину suspension;
- plan/entitlements;
- storage/API/job/AI quotas;
- export и deletion workflow;
- правила retention;
- largest-tenant monitoring;
- путь shared → silo, если это продаваемая возможность.

Удаление тенанта — idempotent, resumable job с dry-run, approval для production и audit trail.

---

## 14. Authentication и authorization

### 14.1. Trust boundary

Frontend container считается недоверенным с точки зрения авторизации. Только backend:

- проверяет session/token;
- связывает пользователя с tenant;
- определяет permissions;
- выполняет sensitive re-auth;
- создаёт audit event.

Заголовки вида `X-User-Id`, `X-Tenant-Id`, `X-Role` от браузера игнорируются.

### 14.2. Browser session

Дефолт — серверная session в БД и first-party cookie через один origin:

```text
/       -> frontend
/api/*  -> backend
```

Cookie:

- `Secure` в production;
- `HttpOnly`;
- явный `SameSite`;
- ограниченный `Path` и корректный `Domain`;
- rotation после login, privilege change и sensitive events.

Same-origin не отменяет CSRF. State-changing запросы ОБЯЗАНЫ проходить Origin/CSRF protection.

### 14.3. Session consistency

- DB lookup на каждый запрос обеспечивает быстрый отзыв, но создаёт горячий DB-path;
- короткий signed cookie/session cache допустим только с задокументированным окном устаревания;
- критические операции — изменение пароля, payout, выдача admin, API key creation — перепроверяют актуальную session и требуют recent authentication/MFA;
- обещание «мгновенный отзыв» ЗАПРЕЩЕНО при включённом cache window.

### 14.4. Обязательный auth lifecycle

Production-система с пользовательскими аккаунтами ОБЯЗАНА определить:

- signup/invitation policy;
- email/domain verification;
- password reset и account recovery;
- MFA/passkeys для admins и C2/C3 privileged users;
- session/device list и logout-all;
- lockout/rate limit без удобного DoS легитимного пользователя;
- account linking и защита от takeover;
- offboarding и deprovisioning;
- реакцию на смену email/identity provider;
- audit login, recovery, MFA и privilege changes.

### 14.5. B2B memberships

- active tenant не принимается из cookie/localStorage без проверки membership;
- переключение tenant повторно проверяет membership;
- invitation token одноразовый, короткоживущий и хранится в хешированном виде;
- удаление пользователя из organization отзывает tenant access;
- enterprise SSO/SCIM не реализуется «частично»: либо утверждённый полноценный integration, либо функции нет.

### 14.6. API keys и service identity

- API keys хранятся только как hash + prefix/metadata;
- показываются пользователю один раз;
- имеют scopes, tenant, owner, created/last-used/expiry/revoked timestamps;
- service tokens короткоживущие, audience-bound и минимально scoped;
- один token не используется несколькими сервисами;
- long-lived bearer JWT для browser auth ЗАПРЕЩЁН;
- JWT claims не заменяют актуальную server authorization для критичных действий.

### 14.7. Break-glass

Break-glass доступ:

- требует MFA и отдельного approval для C2/C3;
- имеет короткий TTL;
- требует reason/ticket;
- создаёт неизменяемый audit event;
- не использует общий постоянный admin password;
- регулярно тестируется.

---

## 15. Секреты и конфигурация

### 15.1. Классы секретов

| Класс | Хранилище |
|---|---|
| Runtime credentials, API keys, certificates | Bearpass / HashiCorp Vault |
| Bootstrap/IaC encrypted configuration | SOPS |
| Human passwords, recovery material | утверждённый password manager |
| Build metadata и несекретный config | репозиторий / deployment config |

Ansible Vault не добавляется, если Ansible не является утверждённым production toolchain.

### 15.2. Vault integration

- приложение не хранит постоянный Vault token;
- Vault Agent выполняет auto-auth, renewal и template rendering;
- секреты предпочтительно передаются через read-only files/socket с минимальными permissions;
- environment injection допустим только когда приложение не умеет безопасно перечитать файл;
- secret zero оформляется machine identity/AppRole-процедурой с минимальными policy;
- Vault policy разделяется по приложению и окружению;
- production service не может читать dev/stage secrets;
- wildcard access к общему secret tree ЗАПРЕЩЁН.

### 15.3. Ротация и отказ Vault

Для каждого секрета определяется:

- owner;
- источник;
- TTL/rotation period;
- reload/restart behavior;
- что происходит при истечении lease;
- что происходит при недоступности Vault;
- процедура emergency revoke.

Приложение не должно падать немедленно при кратком outage Vault, если действующий lease ещё валиден. Startup нового instance без обязательного секрета должен fail closed.

Dynamic PostgreSQL credentials предпочтительны только после тестирования rotation с connection pool. Иначе используются Vault-managed static roles с автоматической ротацией.

### 15.4. Запреты

Секреты ЗАПРЕЩЕНО:

- коммитить в git, включая history;
- помещать в Dockerfile/image layer;
- передавать build arguments, попадающие в history;
- печатать в CI output;
- включать в exception, trace attributes или analytics events;
- хранить в frontend runtime config;
- передавать AI-модели без специальной policy.

### 15.5. Сам Vault

Vault — production dependency и ОБЯЗАН иметь:

- backup storage/backend;
- unseal/recovery procedure;
- обновляемый runbook;
- мониторинг expiry/availability;
- отдельный доступ операторов;
- проверку восстановления;
- документированный RTO.

Хранилище секретов без собственной recovery-модели запрещено.

---

## 16. Reverse proxy, сеть и контейнеры

### 16.1. Сетевая топология

- наружу публикуется только reverse proxy;
- backend, PostgreSQL, Vault Agent, worker admin endpoints и monitoring ports не публикуются в Internet;
- Docker networks разделяют public edge, application и data plane;
- frontend не имеет сетевого доступа к PostgreSQL/Vault без необходимости;
- egress ограничивается, особенно для AI, document processing и webhook fetchers;
- production TLS завершается на утверждённом proxy, HTTP перенаправляется на HTTPS;
- browser API по умолчанию same-origin, CORS отключён;
- внешние origins разрешаются только явным allowlist; `*` с credentialed requests запрещён.

### 16.2. Trusted proxy contract

Backend доверяет `Forwarded`/`X-Forwarded-*` только от известных proxy addresses. Proxy:

- перезаписывает, а не слепо дополняет spoofable client headers;
- задаёт request ID;
- ограничивает header/body size;
- имеет отдельные timeout для обычного HTTP и SSE;
- не буферизует streaming endpoints;
- передаёт реальный scheme/host безопасным способом.

### 16.3. Container hardening

Production container:

- запускается не от root;
- имеет read-only root filesystem, где это возможно;
- использует tmpfs/явные writable volumes;
- не монтирует Docker socket;
- не запускается privileged;
- удаляет Linux capabilities до минимального набора;
- имеет CPU/memory/PID limits;
- имеет seccomp/AppArmor/аналогичный профиль, если поддерживается host;
- использует минимальный pinned base image;
- содержит только runtime dependencies;
- получает image по digest;
- корректно обрабатывает SIGTERM и завершает запросы в пределах grace period.

### 16.4. Health endpoints

- `/health/live` проверяет, что процесс не завис;
- `/health/ready` проверяет способность принимать новый трафик без тяжёлых destructive probes;
- readiness не должна создавать лавину запросов в зависимую систему;
- health endpoints не раскрывают версии, secrets, connection strings и topology;
- worker имеет отдельный heartbeat/lag signal.

### 16.5. Host hardening

- SSH password login отключён; используются keys и ограниченные sudo grants;
- firewall открывает только необходимые порты;
- security updates применяются по patch policy;
- application processes не работают от общего human account;
- production host не используется как dev workstation;
- backup credentials отделены от application credentials;
- offsite backup недоступен приложению на удаление всего retention set.

---

## 17. Фоновые задачи, outbox и workflows

### 17.1. Дефолт

Внутренние durable jobs выполняются через PostgreSQL-backed queue и отдельный worker-контейнер. Job, создаваемый как часть бизнес-транзакции в той же БД, МОЖЕТ быть записан непосредственно в queue table в этой транзакции.

Outbox требуется, когда событие должно покинуть PostgreSQL: broker, webhook dispatcher, analytics pipeline или другой service boundary.

### 17.2. Job envelope

Каждая задача содержит:

```json
{
  "job_type": "invoice.generate",
  "schema_version": 2,
  "job_id": "01J...",
  "tenant_id": "...",
  "actor_id": "...",
  "correlation_id": "...",
  "idempotency_key": "...",
  "created_at": "2026-06-23T10:00:00Z",
  "deadline_at": "2026-06-23T10:10:00Z",
  "attempt": 1,
  "payload": {}
}
```

- payload минимален; большие документы хранятся в object storage;
- job schema version неизменяема после публикации;
- worker поддерживает минимум текущую и предыдущую версию во время rollout;
- tenant context обязателен для tenant job;
- cross-tenant job явно помечен и использует privileged application path.

### 17.3. Semantics

- обработка проектируется как at-least-once;
- side effects идемпотентны;
- «exactly once» не заявляется;
- retry классифицирует transient и permanent errors;
- backoff использует jitter;
- attempts и absolute deadline ограничены;
- poison message попадает в DLQ/failed state;
- ручной replay требует audit и не меняет исходный payload;
- cancellation и timeout учитываются в handler;
- retry storm ограничивается global/provider concurrency.

### 17.4. Outbox relay

Outbox relay:

- читает bounded batches;
- использует безопасную конкуренцию (`FOR UPDATE SKIP LOCKED` или эквивалент);
- хранит attempts/last_error/next_attempt;
- публикует idempotency/event ID;
- измеряет oldest-event lag;
- очищает/partition-ит историю по retention;
- не удаляет запись до подтверждённого publish policy;
- предполагает повторную доставку, поэтому consumer всё равно идемпотентен.

### 17.5. Cron

- cron handler идемпотентен;
- используется lease/advisory lock для исключения нежелательного параллельного запуска;
- определены catch-up и missed-run semantics;
- длительная задача не выполняется внутри scheduler process — scheduler ставит job;
- last success, duration и next run наблюдаемы.

### 17.6. Когда разрешён Temporal

Temporal допускается, когда одновременно присутствует значимая часть признаков:

- workflow живёт часы/дни/месяцы;
- есть ожидание human/external signal;
- требуется durable resume после deploy/outage;
- есть сложная компенсация;
- нужна видимость истории состояния;
- PostgreSQL state machine стала доказанно трудно поддерживаемой.

Temporal не отменяет idempotency внешних effects. Self-hosted Temporal требует отдельного production readiness review.

### 17.7. Когда разрешён NATS/Kafka

NATS JetStream:

- несколько независимых consumers;
- replay/fan-out;
- отдельные deployment units;
- команда готова эксплуатировать нормальный кластер, а не выдавать single node за HA.

Kafka/Redpanda:

- долговременный replay и partition ordering;
- несколько consumer groups;
- высокая постоянная ingestion;
- event log является продуктовой capability;
- есть отдельный операционный владелец.

Количество сообщений само по себе не является достаточным основанием.

---

## 18. Внешние интеграции и webhooks

### 18.1. Provider adapter

Каждый внешний provider скрыт за узким application port. Domain/application code не зависит напрямую от SDK provider.

Adapter определяет:

- timeout;
- retry policy;
- idempotency;
- rate/quota limit;
- circuit breaker/bulkhead;
- mapping ошибок;
- telemetry без утечки payload;
- fallback/degraded behavior;
- reconciliation source.

### 18.2. Deadlines и retries

- у каждого network call есть connect и response timeout;
- retry выполняется только для явно безопасных ошибок/операций;
- write без idempotency не повторяется автоматически;
- общий deadline запроса передаётся вниз;
- клиентский disconnect отменяет ненужную работу;
- retry budget ограничен, чтобы зависимость не получила усиленную атаку во время аварии.

### 18.3. Входящие webhooks

Webhook endpoint:

1. проверяет размер и content type;
2. сохраняет raw body для signature verification в допустимый retention;
3. проверяет signature/timestamp/replay window;
4. записывает event в durable inbox с unique provider event ID;
5. быстро отвечает после durable accept;
6. обрабатывает событие асинхронно и идемпотентно;
7. имеет reconciliation job на случай пропуска/расхождения.

Порядок доставки не считается гарантированным, если provider явно этого не обещает.

### 18.4. Исходящие webhooks

- payload versioned;
- подписывается HMAC/асимметрично;
- secret поддерживает rotation overlap;
- delivery имеет attempts, response summary, next retry и disable policy;
- customer endpoint не вызывается в бизнес-транзакции;
- предусмотрены replay и delivery history;
- SSRF-защита блокирует private/link-local/loopback destinations, если они не разрешены явно.

### 18.5. Платежи

- приложение не хранит card data, если это не отдельная compliance-программа;
- provider webhook считается внешним событием, а не единственным синхронным ответом checkout;
- event ID дедуплицируется;
- собственная order/subscription state machine отделена от provider status;
- периодический reconciliation сравнивает provider и локальное состояние;
- refund, retry, dispute и partial failure моделируются явно;
- денежный side effect всегда имеет idempotency key.

---

## 19. Cache, rate limiting, quotas и feature flags

### 19.1. Cache policy

Cache не является дефолтом. Порядок оптимизации:

1. исправить запрос и индекс;
2. уменьшить payload/N+1;
3. применить HTTP/CDN caching для публичных данных;
4. применить bounded in-process cache для immutable/reference data;
5. только затем вводить shared cache.

Для каждого cache фиксируются:

- owner/source of truth;
- key и обязательный tenant/auth scope;
- TTL;
- invalidation;
- max staleness;
- stampede protection;
- behavior при cache outage;
- метрики hit/miss/eviction.

Кэшировать authorization decision дольше допустимого revocation window ЗАПРЕЩЕНО.

### 19.2. Redis

Redis вводится только для shared capability: distributed rate limit, shared cache, ephemeral coordination или locks с корректной fencing-моделью.

Redis не используется как бесконтрольный system of record. При его отказе приложение должно иметь определённый fail-open/fail-closed режим.

### 19.3. Rate limiting

Лимиты многоуровневые:

- anonymous/IP;
- session/actor;
- API key;
- tenant;
- endpoint/operation;
- expensive AI/export/search;
- upstream provider quota.

Для каждого лимита задаются burst, sustained rate, window, key, storage и поведение при недоступности limiter. Ответ использует `429` и `Retry-After`, где применимо.

In-memory limiter допустим только для single-instance best-effort защиты. При нескольких replicas используется shared backend или proxy-level enforcement.

### 19.4. Quotas и fairness

- tenant quotas проверяются до постановки дорогостоящей работы;
- queue concurrency распределяется так, чтобы один tenant не занял всех workers;
- AI budgets ограничиваются по request/user/tenant/day;
- export/import имеют отдельные concurrency limits;
- превышение quota создаёт понятный business error и metric.

### 19.5. Feature flags

Feature flag:

- типизирован;
- имеет owner и expiry date;
- имеет default для отсутствующей конфигурации;
- поддерживает tenant/user percentage rollout при необходимости;
- изменения аудируются;
- kill switch тестируется;
- не используется как постоянная authorization-модель;
- удаляется после завершения rollout.

---

## 20. Файлы и object storage

- файлы хранятся через S3-compatible API;
- DB хранит metadata, ownership, checksum, state и object key;
- upload использует size limit, MIME/content validation и случайный server-generated key;
- пользовательское имя файла не используется как filesystem path;
- новые файлы проходят quarantine и malware/content scan по risk profile;
- archive/document parsers выполняются в ограниченном worker-контейнере;
- zip/decompression bomb и parser timeout учитываются;
- download выдаётся через короткоживущий signed URL либо контролируемый backend stream;
- tenant access проверяется до выдачи URL;
- lifecycle/retention и orphan cleanup обязательны;
- production object store и ключи шифрования входят в backup/restore plan;
- публичный bucket запрещён, кроме явно публичных immutable assets.

---

## 21. Окружения и управление конфигурацией

### 21.1. Окружения

Минимум:

- **dev** — локальная разработка и disposable data;
- **preview/test** — ephemeral environment для PR/интеграции;
- **stage** — обязателен для C2/C3, использует production-like config semantics;
- **prod** — отдельные secrets, data и access controls.

Полный scale parity не требуется. Обязателен паритет:

- image/artifact;
- способа конфигурации;
- migration mechanism;
- reverse proxy semantics;
- auth и RLS behavior;
- поддерживаемых PostgreSQL extensions.

Различия topology/scale документируются в service profile.

### 21.2. Данные окружений

- production data не копируется в dev/stage без маскирования и approval;
- test fixtures детерминированы;
- seed не создаёт production admin с известным паролем;
- stage интеграции используют sandbox accounts либо явно изолированные production scopes;
- email/SMS/payment side effects в non-prod маршрутизируются в безопасный sink.

### 21.3. Configuration drift

- ручные изменения production host запрещены, кроме emergency procedure;
- изменение фиксируется в IaC/deployment config после инцидента;
- drift проверяется автоматикой или регулярным review;
- production defaults не зависят от содержимого developer `.env`.

---

## 22. CI/CD и supply chain

### 22.1. Branch и review policy

- main защищён;
- production change проходит pull request, кроме break-glass emergency;
- автор не может быть единственным approver своего security-critical изменения;
- CODEOWNERS/аналог обязателен для auth, RLS, migrations, Vault, CI/CD, infrastructure и AI tool permissions;
- merge запрещён при незавершённых blocking gates;
- force-push и удаление release tags ограничены.

Для команды из одного человека независимый review заменяется обязательным checklist, delayed second pass и, для C2/C3, внешним/peer review критичных изменений. AI-review не считается независимым human approval.

### 22.2. Обязательный pipeline

Минимальная последовательность:

1. format/lint;
2. typecheck;
3. unit tests;
4. integration tests с реальным PostgreSQL;
5. RLS/authorization negative tests;
6. migration apply на clean DB и upgrade from previous release;
7. OpenAPI generation + breaking diff;
8. secret scanning;
9. dependency/SCA и license checks;
10. SAST по утверждённому набору;
11. image build;
12. image vulnerability scan;
13. SBOM generation;
14. artifact signing/attestation;
15. deploy в preview/stage;
16. smoke/contract/E2E критичных путей;
17. production approval по классу сервиса;
18. deploy одним immutable digest;
19. post-deploy smoke и observability check.

### 22.3. Build once

- production image не пересобирается после stage;
- environment config и secrets подключаются runtime;
- tag не является достаточной идентичностью — deploy фиксирует digest;
- provenance содержит commit, pipeline, BOM и builder identity;
- generated code и OpenAPI artifact входят в source review либо создаются воспроизводимо.

### 22.4. CI identity

- CI использует short-lived identity для Vault/registry/host;
- постоянный production Vault token в CI variables запрещён;
- environment permissions разделены;
- fork/untrusted PR не получает secrets;
- deployment credentials не доступны build jobs без необходимости;
- production deploy log содержит actor, commit, digest и migration version.

### 22.5. Dependency policy

- lockfile обязателен;
- base images и critical tools pin-ятся;
- automated update PR включены;
- обновления группируются так, чтобы их можно было проверить и откатить;
- EOL runtime/framework запрещён;
- exception на уязвимую dependency имеет mitigation, owner и expiry;
- abandoned package в auth/crypto/network path заменяется либо форкается с владельцем.

---

## 23. Deployment и rollback

### 23.1. Production golden path

- Docker Compose — локальный orchestration;
- production deploy выполняется Kamal-конфигурацией из репозитория;
- один deployment coordinator держит lock;
- host inventory и roles versioned;
- registry image immutable;
- reverse proxy обновляет routing только после readiness.

Альтернативный production mechanism требует организационного ADR. Нельзя одновременно считать Compose, Kamal и Coolify равноправными дефолтами.

### 23.2. Lifecycle процесса

Приложение ОБЯЗАНО:

- перестать принимать новый трафик после readiness=false;
- обработать SIGTERM;
- завершить/отменить in-flight requests в grace period;
- закрыть pools и exporters;
- не брать новые jobs после drain signal;
- вернуть незавершённый job в retryable state;
- не терять accepted write после ответа клиенту.

### 23.3. Стратегия rollout

- C1: rolling/recreate с допустимым окном, если это заявлено;
- C2: zero/low-downtime rolling или blue/green, N/N−1 compatibility;
- C3: canary/blue-green, automated health gates и tested failback.

### 23.4. Rollback

- application rollback возвращает предыдущий image digest;
- database rollback по умолчанию выполняется roll-forward исправлением;
- destructive down migration не считается надёжным rollback;
- feature flag/kill switch используется для отделения deploy от release;
- rollback trigger и ответственный определены до выпуска;
- rollback не должен требовать восстановления всей БД из backup из-за обычной ошибки релиза.

---

## 24. Миграции PostgreSQL под нагрузкой

### 24.1. Общие правила

- migration files immutable после применения в любом shared environment;
- migration не запускается каждым app replica;
- применяет один deploy job с advisory/deployment lock;
- CI проверяет clean install и upgrade path;
- production migration имеет `lock_timeout` и разумный `statement_timeout`;
- длительный data backfill отделяется от schema deployment;
- каждая migration классифицируется как safe, online-with-plan или maintenance-window.

### 24.2. Expand/contract

Breaking schema change проходит этапы:

1. **expand** — добавить совместимую колонку/таблицу/API;
2. deploy кода, понимающего старую и новую форму;
3. resumable batched backfill;
4. verify counts/checksums/invariants;
5. переключить read/write path feature flag-ом;
6. наблюдать;
7. **contract** — удалить старый path в отдельном релизе.

Прямое rename/drop, требующее одновременного обновления всех replicas, запрещено для C2/C3.

### 24.3. Индексы и constraints

- индекс на крупной активной таблице создаётся online/concurrently, если поддерживается и требуется;
- failed concurrent index проверяется и очищается;
- новый constraint на большой таблице вводится через staged validation, когда это уменьшает lock risk;
- изменение типа/табличный rewrite требует benchmark на production-sized clone;
- foreign key creation анализируется по индексам обеих сторон;
- migration не держит transaction open во время backfill часовыми блоками.

### 24.4. Backfill

Backfill:

- идемпотентен и resumable;
- работает bounded batches;
- имеет checkpoint/progress;
- ограничивает DB load;
- допускает pause/cancel;
- не блокирует hot rows надолго;
- измеряет lag/error rate;
- обрабатывает строки, созданные во время перехода;
- имеет verification query и критерий завершения.

### 24.5. Migration review checklist

Перед production:

- оценён lock level;
- оценён table/index size;
- проверены long-running transactions;
- определены timeout и abort path;
- проверена совместимость предыдущего и нового image;
- создан backup/restore point для high-risk change;
- определён roll-forward;
- migration прогнана на realistic dataset;
- post-migration validation автоматизирована.

---

## 25. Backups, restore и disaster recovery

### 25.1. Backup strategy

Для C1:

- автоматический encrypted offsite backup;
- retention не менее согласованного business period;
- дополнительный logical dump рекомендуется для portability.

Для C2/C3:

- base backup + непрерывный WAL archive/PITR;
- копия в отдельном failure domain;
- backup manifest/integrity check;
- logical dump как вторичный portable mechanism, но не единственный;
- retention tiers;
- мониторинг freshness и WAL gaps.

### 25.2. Что входит в backup scope

- PostgreSQL;
- object storage и metadata consistency;
- Vault storage/recovery material по утверждённой процедуре;
- deployment/IaC/config repository;
- signing/recovery keys;
- critical external configuration, которую нельзя восстановить API-скриптом;
- audit data в соответствии с retention.

Cache, search и vector indexes могут не backup-иться, если документирован и протестирован rebuild.

### 25.3. Restore drill

Restore drill ОБЯЗАН:

1. развернуть чистое окружение;
2. получить backup без доступа к production data plane;
3. восстановить БД до заданной точки времени;
4. применить необходимые secrets/config;
5. запустить приложение;
6. проверить бизнес-инварианты, auth и tenant isolation;
7. измерить фактические RPO/RTO;
8. зафиксировать gaps и владельцев исправления.

Проверка «файл существует» не является restore test.

Периодичность:

- C1 — не реже квартала;
- C2 — ежемесячно;
- C3 — ежемесячно плюс регулярный failover/DR exercise.

### 25.4. Tenant-level recovery

Полный PITR восстанавливает кластер, а не одного клиента. Проект ОБЯЗАН явно заявить одну из гарантий:

- tenant-level restore не предоставляется;
- предоставляется экспорт/import на определённую точку;
- предоставляется логический journal/event recovery;
- tenant находится в отдельном silo.

Маркетинговое обещание восстановления одного тенанта без технического механизма запрещено.

### 25.5. Disaster scenarios

Runbook минимум покрывает:

- потерю application host;
- потерю PostgreSQL primary;
- corruption/operator deletion;
- утечку/компрометацию secret;
- потерю Vault;
- недоступность registry;
- ошибочную migration;
- недоступность внешнего provider;
- ransomware/удаление локальных volumes.

---

## 26. Observability, audit и SLO

### 26.1. Минимальный набор

Каждый production service имеет:

- structured JSON logs;
- metrics;
- error tracking/exception aggregation;
- trace/correlation context;
- dashboards и alerts;
- business SLIs;
- отдельный security/business audit trail.

Full tracing не обязано быть 100%. Sampled tracing обязательно для внешних интеграций, async chains, AI tool calls и расследования latency.

### 26.2. Логи

Обязательные поля:

```text
timestamp, level, service, environment, version,
trace_id, span_id, request_id,
actor_id_hash/tenant_id where permitted,
event, outcome, duration_ms, error_code
```

Запрещено по умолчанию логировать:

- request/response body;
- cookies и authorization headers;
- passwords, tokens, API keys;
- raw prompts/documents;
- payment data;
- full PII;
- DB connection strings;
- signed URLs.

Redaction выполняется до logger/exporter. Используется allowlist полей, а не надежда на blacklist регулярных выражений.

### 26.3. Audit log

Audit log отделён от diagnostic logs. Он фиксирует:

- actor/service identity;
- tenant;
- action;
- object/type/id;
- result;
- reason/ticket для privileged action;
- timestamp;
- request/correlation ID;
- безопасное before/after summary или hash.

Audit events append-only, имеют ограниченный write access, заданный retention и tamper-evidence/внешний export для C2/C3.

### 26.4. Metrics

Минимум:

- RED: rate, errors, duration;
- saturation: CPU, memory, event loop, connection pool wait;
- PostgreSQL: connections, locks, slow queries, cache hit, WAL, replication/backup lag, vacuum/bloat indicators;
- queue: depth, oldest age, processing time, retries, failures;
- external providers: latency, errors, rate limit;
- auth: login failures, recovery/MFA events, denied actions;
- tenant/AI cost and quota;
- business flow completion/failure.

High-cardinality labels — user ID, raw URL, prompt, object ID — запрещены в metrics.

### 26.5. OpenTelemetry pipeline

- telemetry export не блокирует бизнес-запрос;
- Collector использует memory limiter, batch, bounded sending queue и retry;
- queue saturation/drop metrics алертятся;
- sampling policy документирована;
- 100% ошибок/critical flows сохраняются, если backend позволяет;
- trace attributes проходят ту же privacy policy, что logs;
- observability backend outage не должен обрушать приложение.

### 26.6. SLO и alerts

- у C2/C3 есть минимум availability и latency SLO;
- alert строится по пользовательскому симптому и burn rate, где возможно;
- каждый paging alert имеет owner и runbook;
- alert без действия удаляется или понижается;
- container restart сам по себе не всегда paging event;
- backup freshness, restore drill age и certificate expiry обязательно наблюдаются.

---

## 27. Стратегия тестирования

### 27.1. Принцип

Тесты защищают инварианты и failure semantics. Количество E2E и процент coverage не являются целью.

### 27.2. Обязательные уровни

| Уровень | Что проверяет |
|---|---|
| Unit | чистые бизнес-правила, state transitions, расчёты |
| Property/table-driven | граничные значения, инварианты, комбинации ролей/состояний |
| Integration | реальный PostgreSQL, constraints, transactions, RLS, queue |
| Contract | OpenAPI, provider adapters, webhooks, event/job schemas |
| E2E | money paths, auth, tenant isolation, destructive/admin paths |
| Migration | clean apply, upgrade, compatibility, backfill verification |
| Performance | representative data/load, regression budgets |
| Recovery | backup restore и critical smoke |
| AI eval | quality, safety, tool behavior, cost/latency regression |

### 27.3. Security tests

Обязательны negative tests:

- cross-tenant read/write;
- privilege escalation;
- object ownership bypass;
- CSRF/origin;
- replay/idempotency;
- webhook signature/duplicate;
- SSRF destinations;
- file upload abuse;
- log redaction;
- expired/revoked session/API key;
- AI tool call вне scope.

### 27.4. E2E

E2E покрывает критичные пользовательские сценарии, а не каждый CRUD-screen. Список формируется из risk map:

- login/recovery/MFA;
- основной revenue/business path;
- tenant switching/isolation;
- payment/provisioning;
- destructive action;
- degraded external dependency;
- rollback-compatible smoke.

### 27.5. Flaky tests

- flaky test не ретраится бесконечно;
- причина устраняется либо тест quarantine-ится с owner/expiry;
- quarantined critical test блокирует release до risk acceptance;
- test data и clock контролируются;
- network providers заменяются contract fakes, а не случайными live calls.

### 27.6. AI-generated tests

Тест, созданный тем же агентом из той же реализации, не считается независимой спецификацией. Security и business invariants формулируются человеком или отдельным review-процессом до/независимо от кода.

---

## 28. Security, privacy и vulnerability management

### 28.1. Threat model

До C2/C3 launch обязателен data-flow/threat model, покрывающий:

- trust boundaries;
- actors и privileges;
- входные данные и uploads;
- tenant isolation;
- external integrations;
- secrets;
- admin/break-glass;
- backup/restore;
- AI/MCP/tool execution;
- abuse и cost-exhaustion.

Threat model обновляется при изменении auth, tenancy, payment, file/AI tooling или network topology.

### 28.2. Data classification

Каждый тип данных получает класс:

- Public;
- Internal;
- Confidential;
- Restricted/regulated.

Для класса определяются допустимые storage, logs, analytics, AI providers, retention, encryption, export и deletion.

Production PII не используется для обучения/eval без отдельного legal/security основания.

- encryption in transit обязательна;
- backup и диски/volumes с Confidential/Restricted data шифруются;
- field/application-level encryption вводится для особо чувствительных значений, если disk-level encryption не закрывает threat model;
- ключи отделены от зашифрованных данных и имеют rotation/recovery plan.

### 28.3. Web security baseline

- HTTPS/HSTS в production;
- CSP и security headers;
- CSRF/origin protection;
- server-side authorization на каждый sensitive action;
- parameterized SQL;
- SSRF allowlist/egress controls;
- safe file parsing;
- output encoding;
- secure cookie/session management;
- no verbose errors;
- rate limits и abuse controls;
- re-auth для sensitive changes.

### 28.4. Vulnerability SLA

Дефолт, если service profile не строже:

| Severity | Internet-facing/actively exploitable | Остальное |
|---|---:|---:|
| Critical | mitigation ≤ 24 ч, patch ≤ 72 ч | ≤ 7 дней |
| High | ≤ 7 дней | ≤ 14 дней |
| Medium | ≤ 30 дней | ≤ 60 дней |
| Low | плановый цикл | плановый цикл |

Исключение содержит compensating control, owner и expiry.

### 28.5. Access review

- production access — least privilege и персональный;
- shared accounts запрещены;
- quarterly review минимум для C2/C3;
- departing member access отзывается в тот же рабочий день;
- database admin access не используется приложением;
- production data access имеет audit и business reason;
- AI-agent identities рассматриваются как отдельные service identities.

### 28.6. Retention и deletion

- retention определяется по типу данных, а не единой цифрой;
- deletion распространяется на primary data, object storage, search/vector derivatives и future backups согласно заявленной политике;
- backup deletion может быть отложенной до expiry retention и должна быть честно описана;
- legal hold имеет отдельный контролируемый процесс;
- audit/security logs не удаляются обычным tenant admin без policy.

---

## 29. AI-native и агентские функции

### 29.1. Базовая архитектура

Все вызовы моделей проходят через application-owned model gateway/adaptor. Domain module не вызывает provider SDK напрямую.

Gateway нормализует:

- model/provider ID;
- timeout и cancellation;
- token/cost accounting;
- retries/fallback;
- safety/data policy;
- trace context;
- prompt/tool versions;
- response schema validation.

### 29.2. Versioning

Для каждого AI-run сохраняются, с учётом privacy:

- use case;
- prompt/template version;
- model/provider version/alias;
- tool registry version;
- retrieval/index version;
- generation parameters;
- input/output hashes или безопасный retained sample;
- latency, tokens, cost;
- eval/guardrail outcome;
- actor/tenant/correlation.

Нельзя выпускать prompt/model change без возможности сравнить его с предыдущей версией.

### 29.3. Evals

AI capability не считается протестированной наличием нескольких «хороших примеров». Обязательны:

- versioned representative dataset;
- adversarial/prompt-injection set;
- task-specific metrics;
- human rubric для субъективных задач;
- regression thresholds;
- cost и latency budgets;
- tool-call correctness;
- tenant/privacy leakage tests;
- fallback behavior;
- sampling production failures обратно в eval set после sanitization.

### 29.4. Tool risk levels

| Уровень | Пример | Policy |
|---|---|---|
| **T0** | чтение публичных данных | может выполняться автоматически |
| **T1** | чтение внутренних данных в scope пользователя | server authorization + audit |
| **T2** | обратимое внутреннее изменение | explicit policy, preview/confirmation по риску |
| **T3** | деньги, удаление, внешний publish, privilege change | обязательное human approval или отдельный строго ограниченный deterministic workflow |

Модель не повышает себе scope. Tool handler повторно проверяет actor, tenant, resource и operation.

### 29.5. Prompt injection и data exfiltration

- retrieved documents и tool output считаются недоверенными;
- system/developer instructions отделяются от user/content data;
- секреты не помещаются в prompt;
- egress destinations allowlisted;
- URL fetcher блокирует private/link-local/loopback ranges и небезопасные redirects;
- document parser sandboxed;
- модель не получает raw database credential;
- output, используемый в SQL/shell/template/HTML, проходит строгую schema validation и безопасное исполнение;
- prompt injection tests входят в CI/eval gate.

### 29.6. MCP

MCP — integration protocol, а не trust boundary.

- servers/tools allowlisted;
- local MCP server считается исполняемым кодом;
- запускается sandboxed с минимальными filesystem/network permissions;
- wildcard scopes запрещены;
- token audience и server-side authorization проверяются;
- token passthrough запрещён;
- dangerous tool требует explicit consent/approval;
- session ID не используется вместо authentication;
- все tool calls аудируются;
- production MCP endpoint не доступен без auth/rate limits.

### 29.7. Cost и availability

- per-request max tokens/time/tool calls;
- per-user/tenant/day budget;
- concurrency limit на provider/model;
- runaway agent loop имеет max steps и absolute deadline;
- provider outage имеет понятный degraded mode;
- fallback model проходит отдельные evals;
- disconnect отменяет ненужный inference;
- cached AI output имеет provenance и TTL.

### 29.8. Human-in-the-loop

Approval UI показывает:

- какое действие будет выполнено;
- над каким tenant/resource;
- параметры и ожидаемый effect;
- внешнего получателя;
- стоимость/необратимость;
- модельное объяснение отдельно от trusted deterministic facts.

Approval token одноразовый, связан с exact action fingerprint и имеет короткий TTL.

---

## 30. RAG, vector search и analytics

### 30.1. RAG ingestion

Pipeline хранит:

- source/document ID;
- tenant/ACL metadata;
- content hash;
- parser/chunker version;
- embedding model/version/dimensions;
- ingestion status/error;
- deletion tombstone;
- index/rebuild version.

Изменение chunker/embedding model не выполняется «на месте» без versioned reindex и cutover.

### 30.2. ACL и tenant filtering

- retrieval filter строится из trusted backend context;
- tenant/ACL не берутся из prompt;
- exact filter и vector recall тестируются вместе;
- global ANN index с post-filtering не считается безопасным/эффективным без benchmark;
- крупные tenants могут получать partition/partial index или отдельную collection;
- удаление source должно удалять/исключать все chunks и derivatives.

### 30.3. pgvector как дефолт

pgvector используется первым, пока выполняет измеренные требования. Порог определяется не одной цифрой, а:

- dimensions/type;
- raw/index size и долей RAM;
- update/churn;
- metadata filter selectivity;
- p95/p99 latency;
- recall;
- index build/rebuild time;
- backup/restore time;
- влияние на OLTP.

Capacity review обязателен уже примерно с 1 млн высокоразмерных vectors либо раньше, если vector workload влияет на primary. Диапазон 5–20 млн обычно требует отдельного узла/partition/quantization и строгого benchmark. Число 50 млн не является безопасным универсальным порогом.

### 30.4. Dedicated vector DB

Вынос разрешён, если benchmark показывает, что pgvector не выполняет SLA/recall/cost, либо нужны capabilities, которых нет в текущей архитектуре. При выносе:

- PostgreSQL хранит source metadata/status;
- vector store считается rebuildable derivative;
- ingestion идемпотентен;
- dual-write без outbox запрещён;
- tenant isolation тестируется отдельно;
- backup либо rebuild RTO документирован.

### 30.5. Analytics/BI

- тяжёлый BI не выполняется на OLTP primary;
- первый шаг — optimized query/materialized view;
- следующий — read replica или periodic export в DuckDB/Parquet;
- embedded analytics получает statement/resource limits;
- in-process/in-Postgres OLAP extension не должна превращать primary в noisy neighbor;
- ClickHouse вводится при постоянной ingestion и repeated OLAP workload, а не из-за одной большой таблицы;
- analytics data lineage, latency и deletion propagation документируются.

---

## 31. Производительность, capacity и масштабирование

### 31.1. Capacity plan

До C2/C3 launch service profile содержит:

- representative request mix;
- peak/sustained RPS;
- concurrent sessions/streams;
- DB/data size и growth;
- largest tenant share;
- job rate/backlog;
- external provider limits;
- AI concurrency/tokens/cost;
- target p50/p95/p99;
- saturation point и degradation behavior.

Framework benchmark без бизнес-запросов не принимается.

### 31.2. Performance budgets

По умолчанию, если профиль не определил другое:

- обычный API read p95 ≤ 300 ms внутри инфраструктуры приложения;
- обычный write p95 ≤ 500 ms без ожидания долгой внешней операции;
- внешние/долгие процессы переводятся в async workflow;
- pool wait не должен быть значимой долей request latency;
- публичный frontend имеет p75 web-vitals budget;
- queue oldest age имеет SLO;
- AI use case имеет отдельные latency/cost/quality targets.

Это стартовые бюджеты, а не обещание без load test.

### 31.3. Триггеры обязательного пересмотра

Следующие числа — не потолки, а сигнал провести benchmark/architecture review:

| Сигнал | Ориентир пересмотра |
|---|---:|
| Sustained DB-backed API load | 200–1000 RPS на одном типичном VPS, раньше при тяжёлых writes/joins |
| Concurrent SSE | 1 000+ соединений или provider concurrency стал bottleneck |
| Active PostgreSQL queries | десятки длительных или сотни одновременно активных — искать queueing/backpressure |
| Крупная OLTP table | 100 млн строк или migrations/vacuum выходят из бюджета |
| Общий data size | сотни GB и restore/backup не укладываются в RTO |
| Active tenants | тысячи/десятки тысяч либо крупнейший tenant >20–30% ресурса |
| Jobs | сотни jobs/s, queue WAL/I/O конкурирует с OLTP |
| Vectors | ~1 млн high-dimensional или index перестаёт помещаться в memory budget |
| Outbox lag | приближается к business deadline |
| OTel volume | telemetry заметно влияет на CPU/network/storage |

Решение принимается по измерениям, а не автоматически по достижению числа.

### 31.4. Порядок масштабирования

1. измерить;
2. исправить алгоритм, запрос, индекс, payload и N+1;
3. добавить backpressure/caching там, где есть корректная invalidation;
4. увеличить ресурсы VPS/БД;
5. разделить web и DB hosts;
6. добавить stateless replicas и pooler;
7. вынести тяжёлый worker/analytics/vector workload;
8. только затем выделять service boundary.

Микросервис создаётся при отдельном trust/failure/scaling/runtime/release boundary, а не при произвольном размере команды.

### 31.5. Degradation

При перегрузке система:

- ограничивает expensive endpoints;
- отклоняет новую работу с явным retry signal;
- сохраняет критичные writes;
- приоритизирует интерактивный/revenue path над export/reindex;
- не создаёт бесконечные in-memory queues;
- ограничивает tenant fairness;
- предоставляет degraded read-only mode, если он реально спроектирован и протестирован.

---

## 32. Эксплуатация и incident response

### 32.1. Service catalog

Каждый production service зарегистрирован с:

- owner и backup owner;
- class C1/C2/C3;
- URLs/repos/dashboards;
- dependencies;
- data classification;
- RTO/RPO/SLO;
- deploy/rollback runbook;
- restore runbook;
- on-call/escalation;
- last restore drill;
- known exceptions/ADRs.

### 32.2. Runbooks

Минимум:

- deploy/rollback;
- migration failure;
- high DB load/locks;
- queue backlog;
- provider outage;
- auth/session incident;
- secret rotation/compromise;
- backup restore;
- tenant data incident;
- AI runaway cost/tool misuse;
- disk full/certificate expiry.

Runbook содержит команды/queries, безопасные проверки, rollback и escalation. Документ, который никто не выполнял, считается непроверенным.

### 32.3. Incident severity

- **SEV1:** массовая недоступность, потеря/утечка данных, критичный security event;
- **SEV2:** существенная деградация revenue/business path или крупного tenant;
- **SEV3:** ограниченная деградация с workaround;
- **SEV4:** minor defect/операционная задача.

Для SEV1/SEV2:

- назначается incident commander;
- фиксируется timeline;
- изменения выполняются через controlled emergency path;
- сохраняются evidence/logs;
- после стабилизации проводится blameless postmortem с конкретными actions/owners/dates;
- regression test/runbook/alert обновляются.

### 32.4. Регулярные операции

Еженедельно/автоматически:

- backup freshness;
- disk/certificate/secret expiry;
- failed jobs/outbox lag;
- high-severity vulnerabilities;
- PostgreSQL growth/locks/vacuum anomalies.

Ежемесячно:

- dependency/runtime updates;
- C2/C3 restore drill;
- alert review;
- capacity trend;
- stale feature flags/exceptions;
- AI cost/eval drift.

Ежеквартально:

- access review;
- threat model/ADR review для значимых изменений;
- C1 restore drill;
- disaster/tabletop exercise;
- lifecycle/EOL review BOM.

---

## 33. Разработка с AI-агентами

### 33.1. Основной принцип

**AI-generated code считается внешним недоверенным вкладом.** На него распространяются те же и более строгие review gates.

### 33.2. Доступы агента

AI-агенту ЗАПРЕЩЕНЫ:

- production Vault secrets;
- production database credentials/data;
- прямой SSH/sudo на production;
- самостоятельный production deploy;
- самостоятельный merge в protected branch;
- создание/изменение admin grants;
- неограниченный Docker socket;
- доступ ко всем MCP tools «для удобства».

Агент работает в ephemeral sandbox с минимальными dev credentials и ограниченным egress.

### 33.3. Critical paths

Human review обязателен для:

- auth/session/recovery;
- RLS и authorization;
- migrations и destructive SQL;
- криптографии;
- Vault/CI/CD/IaC;
- payments;
- file parsers и SSRF-sensitive code;
- AI tool permissions;
- concurrency/idempotency;
- backup/restore.

Фраза «тесты проходят» не заменяет review этих областей.

### 33.4. Контекст и prompt injection

- issue, README, dependency docs и source files могут содержать hostile instructions;
- агент не выполняет команды из репозитория без policy;
- secrets не помещаются в agent context;
- tool output считается недоверенным;
- destructive commands требуют explicit human approval;
- network/downloaded code проверяется до исполнения;
- agent audit сохраняет существенные tool actions и изменённые файлы.

### 33.5. Качество AI-изменений

PR агента ОБЯЗАН содержать:

- краткое описание intent;
- список изменённых boundaries;
- тесты и способ проверки;
- migration/rollback impact;
- security/privacy impact;
- assumptions и неизвестные;
- generated dependencies/licenses.

Большие «переписать всё» изменения запрещены без поэтапного плана. Агенту выдаются малые bounded tasks с проверяемым результатом.

### 33.6. Независимость проверки

- acceptance criteria формулируются до генерации кода;
- критичные тесты не должны полностью повторять структуру реализации;
- второй агент МОЖЕТ искать дефекты, но не заменяет человека;
- reviewer проверяет diff и runtime behavior, а не доверяет summary агента;
- любой найденный production incident превращается в независимый regression test.

---

## 34. Управление решениями, ADR и исключения

### 34.1. Когда ADR обязателен

- новый runtime/language;
- новый stateful-компонент;
- новый production deploy mechanism;
- microservice extraction;
- изменение tenancy/RLS модели;
- изменение auth/identity provider;
- public breaking API;
- новый external system of record;
- C2/C3 RTO/RPO architecture;
- Temporal/NATS/Kafka/ClickHouse/vector DB/Kubernetes;
- хранение regulated data;
- AI tool уровня T3;
- отказ от обязательного требования стандарта.

### 34.2. ADR template

```markdown
# ADR-NNN: Название

- Status: proposed | accepted | superseded | rejected
- Date:
- Owner:
- Review date:

## Context and constraints
## Decision
## Alternatives considered
## Consequences
## Security/privacy impact
## Operational cost and owner
## Migration and rollback
## Metrics that validate the decision
## Conditions for reversal
```

### 34.3. Реестр исключений

Исключение содержит:

- нарушенное правило;
- причину;
- риск;
- compensating controls;
- owner;
- expiry/review date;
- plan устранения;
- approval по классу сервиса.

Бессрочное исключение запрещено. Если исключение стало постоянным, стандарт или архитектура должны быть пересмотрены явно.

### 34.4. BOM governance

BOM отдельно хранит:

- approved versions;
- EOL dates;
- approved base images;
- package manager/tooling;
- framework alternatives;
- PostgreSQL extensions;
- vulnerability exceptions.

BOM пересматривается минимум ежемесячно; основной стандарт — минимум ежеквартально или после серьёзного инцидента.

---

## 35. Архитектурные контрольные точки

### Gate 0 — классификация

До начала реализации:

- тип приложения;
- service class;
- owner;
- tenants и data classification;
- expected scale;
- RTO/RPO;
- external providers;
- AI capability/tool risk;
- stateful components.

**Выход:** заполненный service profile.

### Gate 1 — архитектура

До основного feature build:

- context/container diagram;
- module boundaries;
- API и data ownership;
- auth/authorization/RLS design;
- threat model;
- failure modes;
- deployment topology;
- migration/backup strategy;
- ADR для отклонений.

**Выход:** architecture approval.

### Gate 2 — pre-production

- CI gates зелёные;
- OpenAPI artifact и generated client синхронны;
- tenant/security negative tests;
- migration tested on realistic data;
- image scan/SBOM;
- observability dashboards;
- backup и successful restore evidence;
- rate limits/quotas;
- runbooks;
- load test для C2/C3;
- AI eval gate, если применимо.

**Выход:** production readiness approval.

### Gate 3 — launch

- immutable digest;
- deploy/rollback owner;
- alerts и escalation активны;
- post-deploy smoke;
- migration validation;
- external webhooks/providers verified;
- no expired exceptions;
- service catalog обновлён.

**Выход:** release record.

### Gate 4 — 30-day operational review

- фактические latency/error/cost;
- DB/query/queue growth;
- incidents и support load;
- noisy tenants;
- flaky tests/alerts;
- AI quality/cost drift;
- необходимость удалить лишние components/flags;
- обновлённый capacity plan.

**Выход:** список обязательных корректировок.

---

## 36. Definition of Done

### 36.1. Feature DoD

Feature не готова, пока:

- business rule реализован на backend;
- server validation и authorization присутствуют;
- DB constraints закрепляют возможные инварианты;
- tenant context/RLS проверены;
- API artifact/client обновлены;
- happy, boundary и negative tests добавлены;
- logs/metrics не раскрывают sensitive data;
- retry/idempotency/concurrency обработаны;
- feature flag имеет owner/expiry, если используется;
- docs/runbook обновлены при operational impact;
- migration имеет rollout/rollback plan;
- accessibility и error states проверены на UI.

### 36.2. Service launch DoD

- class/RTO/RPO/SLO определены;
- production topology и access review завершены;
- backups и restore drill успешны;
- CI/CD и immutable deployment работают;
- secrets rotation и Vault outage behavior проверены;
- dashboards/alerts/runbooks готовы;
- capacity test выполнен;
- critical dependencies и quotas известны;
- incident owner назначен;
- no critical/high unaccepted vulnerability;
- ADR/exceptions зарегистрированы;
- AI eval/tool approvals готовы, если применимо.

---

## 37. Ограничение операционной сложности для команды 1–5

Стандарт рассчитан на маленькую команду, поэтому простота является проверяемым ограничением, а не пожеланием.

- основной application runtime один; второй runtime допустим только как изолированный capability worker;
- production deploy path один на организацию;
- Vault, observability, backup и object storage по возможности являются общими платформенными сервисами, а не отдельной установкой на каждый проект;
- у C2/C3 минимум два человека должны уметь выполнить deploy, rollback, secret rotation и restore по runbook;
- система, которую способен восстановить только автор, не проходит Gate 2;
- junior или AI-agent не является единственным reviewer security-critical change;
- новый компонент принимается только вместе с patch, monitoring, backup/rebuild и decommission plan;
- нестандартный компонент удаляется, если измеренная польза не подтверждена после review date;
- on-call и регулярные операции должны помещаться в реальный трудовой бюджет команды; архитектура, требующая постоянного ручного ухода, отклоняется;
- scaffold/golden repository обязан давать рабочий путь от локального запуска до restore drill, а не только генерировать CRUD.

Для C3 маленькая команда обязана либо использовать разделяемую/внешнюю платформенную эксплуатацию, либо официально выделить on-call и резервного оператора. Архитектура не компенсирует отсутствие людей.

---

## 38. Запрещённые анти-паттерны

1. Frontend или SSR server подключается к PostgreSQL.
2. Авторизация основана на скрытии кнопки.
3. Runtime DB user владеет таблицами, имеет superuser или `BYPASSRLS`.
4. Tenant ID принимается из браузерного header как trusted.
5. `tenant_id` механически ставится первым во всех индексах без query plan.
6. Session-level tenant context используется через transaction-pooled connections.
7. Миграции автоматически запускаются всеми replicas при старте.
8. Долгий backfill выполняется одной transaction в deploy.
9. Backup объявляется рабочим без restore drill.
10. Один VPS рекламируется как high availability.
11. Секреты находятся в `.env` на production host без Vault lifecycle.
12. Request body, cookie, prompt или provider payload логируется по умолчанию.
13. Retry повторяет non-idempotent external write.
14. Fire-and-forget promise выполняет бизнес-задачу из HTTP request.
15. Redis/NATS/Temporal/Kafka добавляются «на будущее».
16. Outbox и queue используются как два дублирующих журнала без причины.
17. BI/large scan выполняется на primary без limits.
18. 20–30 E2E считается универсальным качественным критерием.
19. Framework version закрепляется в долговечном манифесте.
20. AI-модель определяет права доступа или получает admin tool wildcard.
21. AI-агент имеет production secrets и право self-merge/deploy.
22. MCP server запускается с host privileges без sandbox/consent.
23. «Exactly once» заявляется без идемпотентного effect и доказанной модели.
24. Microservice выделяется по числу разработчиков, а не по boundary.
25. Наличие OTel instrumentation выдаётся за готовые observability и incident response.

---

# Приложения

## Приложение A. Service profile

Каждый проект хранит `docs/service-profile.md`:

```markdown
# Service Profile

## Identity
- Service:
- Owner:
- Backup owner:
- Repository:
- Production URL:
- Service class: C1 | C2 | C3
- Application type: admin | B2B | commerce | AI | workflow

## Business criticality
- Critical user journeys:
- Revenue/operational impact:
- Support hours:
- Availability SLO:
- RTO:
- RPO:

## Data
- System of record:
- Data classes:
- Tenancy model:
- Largest tenant assumptions:
- Retention/deletion:
- Object storage:
- Tenant-level restore promise:

## Scale assumptions
- Sustained/peak RPS:
- Concurrent sessions/SSE:
- DB size/growth:
- Largest tables:
- Jobs/s and max backlog:
- Vector count/dimensions:
- AI tokens/cost:

## Dependencies
- PostgreSQL:
- Vault:
- External providers:
- Stateful capability packs:
- Failure/degraded modes:

## Delivery and operations
- Deploy mechanism:
- Migration mechanism:
- Rollback:
- Backup/PITR:
- Last restore drill:
- Dashboards/alerts:
- Runbooks:

## Security
- Auth method:
- MFA/SSO:
- RLS status:
- Threat model:
- Break-glass:
- Current exceptions/ADRs:
```

---

## Приложение B. Минимальный architecture review checklist

### Boundaries

- [ ] Frontend и backend — разные containers/deployment units.
- [ ] Frontend не имеет DB/Vault/queue access.
- [ ] Module API и dependency direction определены.
- [ ] Владение таблицами и внешними systems of record указано.
- [ ] Дополнительные services/components имеют ADR.

### Data и tenancy

- [ ] Runtime role не owner, не superuser, без `BYPASSRLS`.
- [ ] Tenant context transaction-local.
- [ ] `USING` и `WITH CHECK` заданы по операциям.
- [ ] Cross-tenant negative tests есть.
- [ ] Indexes проверены по query patterns.
- [ ] Tenant lifecycle/quotas/deletion описаны.

### Security

- [ ] Backend самостоятельно проверяет identity/tenant/permission.
- [ ] Cookie/CSRF/origin policy описана.
- [ ] MFA/recovery/invitation lifecycle определён.
- [ ] Secrets classes и rotation заданы.
- [ ] Logs используют allowlist и не содержат payload/secrets.
- [ ] Threat model покрывает uploads, webhooks, AI и admin paths.

### Reliability

- [ ] Timeouts/deadlines/retry policy есть.
- [ ] Writes и consumers идемпотентны.
- [ ] Queue/DLQ/replay semantics описаны.
- [ ] External provider reconciliation есть.
- [ ] Health, graceful shutdown и backpressure реализованы.

### Delivery

- [ ] Build once, deploy same digest.
- [ ] Migration не запускается app startup-ом.
- [ ] Expand/contract и backfill plan есть.
- [ ] Roll-forward/rollback определён.
- [ ] Backup и restore drill соответствуют классу.

### Operations

- [ ] SLO/SLI и alerts есть.
- [ ] Dashboards и runbooks проверены.
- [ ] Capacity plan и load test соответствуют классу.
- [ ] Vulnerability/SBOM/image gates включены.
- [ ] Owner и backup owner назначены.

---

## Приложение C. RLS acceptance pack

### C.1. SQL assertions

Автоматизированная проверка должна подтвердить:

```sql
-- runtime не является владельцем
SELECT tableowner <> 'app_runtime'
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'orders';

-- RLS и FORCE RLS включены
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.orders'::regclass;

-- runtime не имеет bypass
SELECT rolbypassrls = false, rolsuper = false
FROM pg_roles
WHERE rolname = 'app_runtime';
```

### C.2. Behavioral assertions

```text
Given tenant A context:
- SELECT by B id -> zero rows/not found
- UPDATE B row -> zero affected/not found
- INSERT with B tenant_id -> policy violation
- UPSERT cannot reassign ownership

Given missing context:
- SELECT -> zero rows or explicit trusted-wrapper error
- INSERT/UPDATE/DELETE -> denied

Given app_owner/migrator:
- never used by runtime process
```

### C.3. Pooling assertion

При PgBouncer transaction mode test обязан открыть несколько logical client requests и доказать отсутствие утечки tenant context между физическими PostgreSQL connections.

---

## Приложение D. Migration plan template

```markdown
# Migration: <name>

- Owner:
- Risk: safe | online-with-plan | maintenance-window
- Tables and current sizes:
- Estimated rows affected:
- Expected lock level/duration:
- `lock_timeout`:
- `statement_timeout`:

## Compatibility
- Previous app version compatible with expanded schema: yes/no
- New app version compatible with old data: yes/no

## Steps
1. Expand:
2. Deploy dual-compatible code:
3. Backfill:
4. Verify:
5. Cut over:
6. Observe:
7. Contract:

## Backfill controls
- Batch size:
- Concurrency:
- Checkpoint:
- Pause/cancel:
- Metrics:

## Validation
- Counts/checksums:
- Invariant queries:
- Query plans:

## Failure response
- Abort condition:
- Roll-forward:
- Application rollback compatibility:
- Backup/restore point:
```

---

## Приложение E. Release checklist

### До deploy

- [ ] Approved commit и immutable image digest.
- [ ] CI/security/contract gates зелёные.
- [ ] Migration review завершён.
- [ ] Previous image digest известен.
- [ ] Feature flags/kill switches настроены.
- [ ] Dashboard открыт, alerts не заглушены без причины.
- [ ] External provider maintenance/quotas проверены.
- [ ] Owner deploy и rollback назначен.

### Во время deploy

- [ ] Deployment lock получен.
- [ ] Migration применяет один job.
- [ ] New instance проходит readiness.
- [ ] Старые instances drained корректно.
- [ ] Error/latency/DB/queue metrics контролируются.

### После deploy

- [ ] Critical smoke paths прошли.
- [ ] OpenAPI/client version совпадают.
- [ ] Migration validation прошла.
- [ ] No abnormal auth/RLS denies or cross-tenant signals.
- [ ] Queue/outbox lag нормален.
- [ ] Release record содержит commit/digest/migration/actor.

---

## Приложение F. Restore drill report

```markdown
# Restore Drill Report

- Date:
- Service/class:
- Operator:
- Backup selected:
- Target recovery time:
- Target recovery point:

## Procedure
- Clean environment created:
- Base backup restored:
- WAL replay target:
- Object storage restored/reconciled:
- Vault/config restored:
- App version deployed:

## Validation
- Authentication:
- RLS/tenant isolation:
- Critical business flow:
- Row/object counts:
- Background jobs/outbox:
- External integrations disabled/reconciled:

## Result
- Actual RPO:
- Actual RTO:
- Data gaps:
- Failed/ambiguous steps:
- Runbook changes:
- Actions, owners, deadlines:
```

---

## Приложение G. Technology exception scorecard

Перед добавлением технологии ответить письменно:

| Вопрос | Ответ |
|---|---|
| Какую измеренную проблему она решает? | |
| Почему PostgreSQL/текущий runtime не решает её? | |
| Какие альтернативы проверены? | |
| Новый process или новый stateful service? | |
| Кто обновляет, мониторит и восстанавливает? | |
| Backup/rebuild/RTO? | |
| Security boundary и secrets? | |
| Как тестируется failure mode? | |
| Как мигрировать данные в неё и обратно? | |
| Какая метрика докажет пользу? | |
| При каком условии решение отменяется? | |

Если на вопросы об owner, restore и reversal нет ответа, технология не вводится.

---

## Приложение H. Минимальный проектный scorecard

Проект не проходит Gate 2 при любом **NO** в блоке Critical.

### Critical

- [ ] Backend владеет бизнес-логикой и данными.
- [ ] Frontend/backend общаются только по API.
- [ ] Runtime DB role безопасна, RLS negative tests проходят.
- [ ] Auth/authorization проверяются backend-ом.
- [ ] Secrets поступают из Vault и не попадают в logs/image.
- [ ] Migration и rollback/roll-forward проверены.
- [ ] Backup восстановлен в drill.
- [ ] Critical path tests проходят.
- [ ] Production image scanned и immutable.
- [ ] Owner/runbooks/alerts назначены.

### Required for C2/C3

- [ ] SLO/RTO/RPO измеримы.
- [ ] PITR и отдельный backup failure domain.
- [ ] Load/capacity test.
- [ ] Threat model.
- [ ] MFA/break-glass/access review.
- [ ] Zero/low-downtime compatibility.
- [ ] Provider reconciliation.
- [ ] Audit trail.
- [ ] Restore drill в требуемый период.
- [ ] No expired architecture exceptions.

### AI capability

- [ ] Model/tool/prompt versions сохраняются.
- [ ] Evals и adversarial set проходят.
- [ ] Cost/concurrency/max-step limits включены.
- [ ] Tool scopes минимальны.
- [ ] T3 actions требуют approval.
- [ ] Prompt injection/SSRF/data leakage tests проходят.

---

## Приложение I. Нормативные и справочные источники

При расхождении примеров этого документа с актуальной официальной документацией приоритет имеет документация поддерживаемой версии и оформленный ADR/BOM update.

### PostgreSQL

- Row Security Policies: <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
- `CREATE POLICY`: <https://www.postgresql.org/docs/current/sql-createpolicy.html>
- Configuration setting functions (`set_config`, `current_setting`): <https://www.postgresql.org/docs/current/functions-admin.html>
- Multicolumn indexes: <https://www.postgresql.org/docs/current/indexes-multicolumn.html>
- `ALTER TABLE`: <https://www.postgresql.org/docs/current/sql-altertable.html>
- `CREATE INDEX`: <https://www.postgresql.org/docs/current/sql-createindex.html>
- Continuous archiving and PITR: <https://www.postgresql.org/docs/current/continuous-archiving.html>
- `pg_basebackup`: <https://www.postgresql.org/docs/current/app-pgbasebackup.html>
- SQL dumps: <https://www.postgresql.org/docs/current/backup-dump.html>

### PgBouncer

- Features and pooling compatibility: <https://www.pgbouncer.org/features.html>
- Configuration: <https://www.pgbouncer.org/config.html>

### API

- OpenAPI Specification: <https://spec.openapis.org/oas/latest.html>
- RFC 9457 — Problem Details for HTTP APIs: <https://www.rfc-editor.org/rfc/rfc9457.html>

### Secrets и контейнеры

- Vault Agent: <https://developer.hashicorp.com/vault/docs/agent-and-proxy/agent>
- Vault Agent templates: <https://developer.hashicorp.com/vault/docs/agent-and-proxy/agent/template>
- Vault database secrets engine: <https://developer.hashicorp.com/vault/docs/secrets/databases>
- Docker Engine security: <https://docs.docker.com/engine/security/>

### Observability и security guidance

- OpenTelemetry Collector resiliency: <https://opentelemetry.io/docs/collector/resiliency/>
- OpenTelemetry sampling: <https://opentelemetry.io/docs/concepts/sampling/>
- OWASP Logging Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>
- OWASP Secrets Management Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html>
- OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>

### Async, payments и AI

- NATS JetStream clustering: <https://docs.nats.io/running-a-nats-service/configuration/clustering/jetstream_clustering>
- Temporal Activity definition/idempotency: <https://docs.temporal.io/activity-definition>
- Stripe webhooks: <https://docs.stripe.com/webhooks>
- pgvector: <https://github.com/pgvector/pgvector>
- MCP Security Best Practices: <https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices>

---

## Финальная позиция стандарта

Приложение не считается зрелым потому, что оно использует React, RLS, Vault, OpenTelemetry или контейнеры. Оно считается зрелым, когда команда может доказать:

1. кто и на каком основании получает доступ к данным;
2. что произойдёт при повторе, таймауте, частичном отказе и конкуренции;
3. как безопасно изменить схему под нагрузкой;
4. как развернуть, откатить и восстановить систему;
5. как обнаружить и расследовать проблему;
6. сколько система выдерживает по измерениям;
7. кто способен поддержать её без единственного незаменимого автора.

Всё остальное — детали реализации и содержимое обновляемого BOM.

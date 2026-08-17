# Контракт результата агентского аудита репозитория

Версия: **2.0.0**  
Назначение: Claude Code, Codex и другие coding-агенты  
Режим: **read-only аудит кодовой базы с обязательным созданием файловых артефактов**

## 1. Что регулирует этот документ

Этот контракт определяет не содержание манифеста, а то, **как агент обязан провести и отдать результат аудита**.

Он решает четыре проблемы:

1. агент не должен ограничиваться текстом в терминале или чате;
2. код, конфигурация, миграции, тесты и исполняемые проверки должны быть первичным источником истины;
3. дефект реализации должен быть отделён от отклонения от манифеста;
4. машинный результат и человеческий отчёт должны быть разными представлениями одних и тех же данных.

При конфликте инструкций действует следующий порядок:

1. `agent_audit_output_contract.yaml` — имена, схемы, язык и критерии завершения;
2. `app_quality_audit_registry.yaml` — проверяемые требования и правила проверки;
3. манифест — нормативный контекст и инженерные рекомендации;
4. документация проекта — заявления, которые необходимо подтвердить кодом и артефактами.

## 2. Главный принцип

> Код и наблюдаемое поведение первичны. Документация описывает намерение, но сама по себе не доказывает реализацию.

Агент обязан опираться прежде всего на:

- исходный код;
- схему БД и миграции;
- конфигурацию окружений;
- Docker, proxy и deployment-конфигурацию;
- CI/CD;
- тесты;
- сгенерированный API-контракт;
- безопасно выполненные build, lint, typecheck, migration и другие проверки;
- реальные operational-артефакты: restore report, release record, dashboards, alerts.

README, ADR, service profile, threat model, runbook и комментарии являются доказательством только того, **что команда что-то заявила**. Они не являются достаточным доказательством того, что механизм работает.

## 3. Манифест не является истиной в последней инстанции

Ревью не должно сводиться к механической схеме:

```text
требование манифеста нарушено → finding → высокий severity
```

Правильная логика:

```text
реальное поведение кода
→ фактический риск
→ применимость к текущей стадии и целевому классу
→ связь с манифестом
→ severity и release decision
```

Следствия:

- критичный дефект может существовать, даже если манифест его не описывает;
- безопасное и осознанное отклонение от рекомендации может быть `info` или `justified_deviation`;
- формальное соответствие манифесту не считается `pass`, если код доказывает обратное;
- отсутствие компонента не является дефектом, пока не доказана его применимость;
- размер команды не снижает риски безопасности, денег, тенантности, целостности данных, миграций, восстановления и release safety.

## 4. Что означает read-only

Read-only запрещает агенту изменять:

- application source code;
- tracked configuration;
- миграции;
- тесты;
- CI/CD;
- существующую документацию вне `audit-output/`.

Read-only **не запрещает**:

- создать `audit-output/`;
- записать туда обязательные результаты;
- выполнить безопасные проверки;
- использовать disposable database/container;
- временно создать dependency/build/cache-файлы в уже gitignored-директориях.

Агент обязан:

1. сохранить `git status` до начала проверки;
2. не менять tracked-файлы;
3. очистить созданные временные файлы вне `audit-output/`, если это возможно;
4. сравнить состояние репозитория после аудита с исходным;
5. зафиксировать проверку целостности репозитория в execution log.

Наличие исходных незакоммиченных изменений не мешает аудиту, но агент не должен добавлять к ним собственные изменения.

## 5. Языки артефактов

### Машиночитаемые файлы

Все YAML и JSON создаются **на английском**:

- keys;
- enum values;
- titles;
- root causes;
- impacts;
- recommendations;
- rationales;
- summaries.

Без перевода сохраняются:

- пути;
- символы;
- команды;
- идентификаторы;
- requirement IDs;
- номера разделов манифеста;
- фрагменты кода.

### Человеко-читаемые файлы

Все Markdown и HTML создаются **на русском**.

Текст должен быть инженерным и предметным:

- без машинного дампа YAML;
- без формальных похвал;
- без расплывчатых формулировок;
- с конкретными путями, идентификаторами, последствиями и способом проверки;
- с отдельной оценкой текущего C1 и целевого C2.

## 6. Два горизонта оценки

Каждое существенное требование и finding оцениваются дважды:

### Current horizon

Текущая стадия:

```text
pre-production, C1
```

Вопрос:

```text
Можно ли выпускать приложение в рамках фактически заявленного текущего профиля?
```

### Target horizon

Целевое состояние:

```text
C2 B2B SaaS
```

Вопрос:

```text
Что дополнительно блокирует запуск как бизнес-критичного многопользовательского SaaS?
```

Один и тот же пункт может иметь разные оценки:

```yaml
current_assessment:
  applicability: justified_deviation
  severity: info
  release_blocker: false
  rationale: Single deployment and one trust domain are proven for current C1 scope.

target_assessment:
  applicability: future_target_only
  severity: critical
  release_blocker: true
  rationale: Shared C2 B2B SaaS requires tenant membership and enforceable isolation.
```

Это не противоречие, а корректное различение горизонтов.

## 7. Классификация findings

### `finding_kind`

Primary classification описывает, **что именно обнаружено**:

```text
code_quality_defect
security_defect
data_integrity_defect
reliability_defect
architecture_gap
api_contract_gap
testing_gap
production_readiness_gap
missing_artifact
missing_evidence
documentation_drift
process_gap
manifest_deviation
justified_deviation
```

### `manifest_relation`

Отдельное поле показывает отношение к стандарту:

```text
aligned
normative_violation
recommendation_deviation
justified_deviation
not_applicable
not_covered_by_manifest
documentation_conflicts_with_code
claim_not_proven
```

Это позволяет зафиксировать, например:

```text
finding_kind: security_defect
manifest_relation: not_covered_by_manifest
```

или:

```text
finding_kind: justified_deviation
manifest_relation: recommendation_deviation
```

### `disclosure_status`

Отдельно фиксируется, осознаёт ли команда проблему:

```text
hidden
```

Проблема не отражена в ADR, threat model, service profile, runbook или реестре рисков.

```text
declared
```

Проблема конкретно описана и признана.

```text
partially_declared
```

Заявлено общее ограничение, но конкретный дефект не раскрыт.

```text
falsely_declared
```

Документация заявляет работающий контроль, а реализация или проверка доказывает обратное.

```text
docs_drift
```

Код уже изменился, а документация описывает старое состояние.

```text
justified_absence
```

Отсутствие осознанно, доказано и допустимо для текущего горизонта.

Эта классификация нужна для отдельного анализа **«заявлено vs реализовано»**.

## 8. Severity и release blocker

Severity определяется реальным сочетанием:

- impact;
- likelihood;
- exposure;
- reversibility;
- detectability;
- затронутого бизнес-пути;
- текущей стадии;
- текущего и целевого класса.

### `critical`

Блокирует release/production: реальный или высоковероятный обход auth, утечка, потеря или порча данных, нарушение денег, межтенантный доступ, невозможность развернуть или восстановить систему.

### `high`

Существенный security/data/reliability/business risk. До production должен быть исправлен либо принят отдельным решением с compensating controls.

### `medium`

Значимый архитектурный, эксплуатационный, тестовый или сопровождаемый долг, повышающий вероятность инцидента или стоимость изменений.

### `low`

Локальное улучшение читаемости, консистентности, поддерживаемости или hardening.

### `info`

Наблюдение, сильная сторона, условное будущее требование либо justified deviation.

`critical` нельзя назначать только потому, что в манифесте написано «ОБЯЗАН». Нужен конкретный impact и достижимый либо гарантированный failure path.

## 9. Evidence model

Каждое доказательство получает отдельный ID:

```text
EV-001
EV-002
...
```

Типы evidence:

- code;
- config;
- migration;
- schema;
- test;
- CI;
- generated contract;
- runtime check;
- operational artifact;
- documentation claim;
- absence;
- inference.

Для исходного файла указываются:

```yaml
path: apps/api/src/auth/auth.module.ts
line_range: L8-L12
symbol: AuthModule
summary: JWT secret falls back to a known development value.
```

Для исполняемой проверки:

```yaml
command: npx prisma migrate deploy
exit_code: 1
environment: disposable PostgreSQL 16
summary: Clean database deployment fails because the first migration alters a missing table.
```

Для отсутствия:

```yaml
kind: absence
searched_paths:
  - .github/**
  - .gitlab-ci.yml
search_terms_or_patterns:
  - CODEOWNERS
  - secret scan
result: No matching artifact was found.
```

Фраза «не найдено» без описания области поиска не считается доказательством.

## 10. Группировка и кросс-подтверждение

Finding создаётся на **root cause**, а не на каждый файл.

Неправильно:

```text
F-001: dev-secret в auth.module.ts
F-002: dev-secret в guard.ts
F-003: dev-secret найден delivery-проходом
```

Правильно:

```text
F-001: Production-sensitive JWT configuration fails open
  evidence: EV-011, EV-032
  confirmations: architecture, security, delivery
  related_axes: architecture, security, delivery
```

Каждый `critical` и `high` должен быть перепроверен:

- двумя независимыми evidence paths;
- либо исполняемым воспроизведением;
- либо вторым независимым проходом.

Если подтверждения недостаточно, finding сохраняется, но confidence и limitation должны быть указаны честно.

## 11. Сильные стороны

Сильные стороны — обязательная часть аудита, но они также требуют evidence.

Нельзя писать:

```text
Архитектура хорошая.
Используется PostgreSQL.
Есть Docker.
```

Нужно писать:

```yaml
strength_id: STR-004
title: Cross-module writes are routed through the owning application service
axis_id: architecture_and_modularity
evidence_refs:
  - EV-077
why_it_matters: Preserves module data ownership and one transaction boundary.
confidence: high
```

Сильные стороны нужны, чтобы определить:

- на какие решения можно опираться;
- что не надо переписывать;
- какие практики стоит масштабировать на слабые модули.

## 12. Правомерно отсутствующее

`justified_absence` используется, когда capability отсутствует, но это:

- соответствует текущему профилю;
- подтверждено кодом и документацией;
- имеет чёткую границу применимости;
- не маскирует активный дефект;
- имеет trigger, после которого исключение перестаёт быть допустимым.

Пример:

```yaml
absence_id: JA-001
capability: PostgreSQL RLS
rationale: Current C1 deployment is proven to serve one trust domain.
evidence_refs:
  - EV-101
  - EV-102
current_assessment:
  applicability: justified_deviation
  release_blocker: false
target_assessment:
  status: fail
  severity: critical
  release_blocker: true
invalidation_triggers:
  - multiple distrusting customers share one database schema
  - service target changes to C2 B2B SaaS
review_or_expiry: before_C2_architecture_approval
```

Бессрочное «нам это не нужно» недопустимо.

## 13. Обязательный комплект файлов

```text
audit-output/
  00_repo_inventory.yaml
  01_review_context.yaml
  02_modules.yaml
  03_module_scorecards.yaml
  04_evidence_map.yaml
  05_requirement_results.yaml
  06_findings.yaml
  07_strengths.yaml
  08_cross_confirmed_findings.yaml
  09_remediation_plan.yaml
  10_justified_absences.yaml
  11_declared_vs_implemented.yaml
  12_risk_register.ru.md
  13_production_readiness_report.ru.md
  14_executive_summary.ru.md
  15_audit_report.ru.html
  16_execution_log.ru.md
  manifest.json
```

Дополнительные supporting-файлы допустимы только в `audit-output/attachments/**`. Они должны быть перечислены в `manifest.json`, не должны содержать секреты или production data и не заменяют обязательные артефакты.

### 13.1. `00_repo_inventory.yaml`

Фиксирует:

- тип и структуру репозитория;
- языки, package managers, frameworks;
- frontend/backend/worker/jobs;
- database и migrations;
- infra/deploy;
- CI/CD;
- docs/ADR/runbooks;
- tests;
- environment configuration;
- найденные и отсутствующие артефакты;
- безопасно выполненные проверки;
- ограничения аудита;
- git integrity before/after.

Каждый ожидаемый scope получает статус:

```text
present | partial | missing | not_applicable | not_reviewed
```

### 13.2. `01_review_context.yaml`

Задаёт планку оценки:

- объект и commit;
- тип приложения;
- текущую стадию;
- текущий C1;
- целевой C2;
- обнаруженную модель тенантности;
- production goal;
- метод аудита;
- review axes;
- assumptions и limitations.

### 13.3. `02_modules.yaml`

Карта реальных модулей:

- purpose;
- paths;
- public API;
- owned data;
- endpoints;
- jobs;
- integrations;
- incoming/outgoing dependencies;
- tenant scope;
- evidence.

Модули определяются по реальным capability и границам кода, а не только по папкам или страницам.

### 13.4. `03_module_scorecards.yaml`

Для каждого модуля:

- maturity;
- boundary quality;
- business logic location;
- transaction integrity;
- authorization;
- data integrity;
- tests;
- operability;
- текущая и целевая готовность;
- strengths;
- findings;
- blockers.

### 13.5. `04_evidence_map.yaml`

Единый канонический индекс доказательств. Остальные YAML ссылаются на `EV-*`, а не дублируют длинные доказательства.

### 13.6. `05_requirement_results.yaml`

Матрица всех требований реестра:

- current status;
- target status;
- applicability;
- rationale;
- evidence refs;
- finding refs;
- release blocker.

Ни одно требование не должно молча исчезать. Непроверенное отмечается как `unreviewed`.

### 13.7. `06_findings.yaml`

Главный реестр находок и source of truth.

Минимальный пример:

```yaml
findings:
  - finding_id: F-001
    stable_key: security:jwt-secret:known-fallback
    title: Production-sensitive JWT configuration fails open
    primary_axis: security_auth_tenancy_and_files
    related_axes:
      - architecture_and_modularity
      - delivery_operations_and_recovery
    finding_kind: security_defect
    lifecycle_status: open
    risk_domains:
      - security
      - deployment
    manifest_relation: normative_violation
    disclosure_status: hidden
    exposure: reachable
    requirement_refs:
      - SEC-001
      - AUTH-001
    manifest_sections:
      - "11.3"
      - "15.4"
    affected_scopes:
      - backend_api
      - configuration
    affected_modules:
      - identity
    evidence_refs:
      - EV-011
      - EV-032
    symptoms:
      - API starts when the required secret is absent.
      - Two code paths read the secret inconsistently.
    root_cause: Required production configuration has a known fallback and no startup validation.
    impact: An attacker can forge authentication tokens when deployment configuration is incomplete.
    likelihood: medium
    confidence: high
    current_assessment:
      applicability: active_defect
      severity: critical
      release_blocker: true
      rationale: Missing configuration silently creates an authentication bypass.
    target_assessment:
      applicability: active_defect
      severity: critical
      release_blocker: true
      rationale: The same bypass remains unacceptable for C2.
    recommendation: Remove the fallback and validate typed configuration before opening the socket.
    verification: Start the API without JWT_SECRET and prove startup fails before listening.
    effort: xs
    adr_or_exception:
      required: false
      reason: A security bypass is not an acceptable permanent deviation.
      compensating_controls_required: false
    owner_suggestion: backend_identity
    confirmations:
      - pass: security_auth_tenancy_files_and_secrets
        evidence_refs: [EV-011]
      - pass: delivery_ci_containers_backups_and_operations
        evidence_refs: [EV-032]
```

### 13.8. `07_strengths.yaml`

Evidence-based сильные стороны по тем же review axes.

### 13.9. `08_cross_confirmed_findings.yaml`

Список findings, подтверждённых несколькими независимыми проходами, с количеством подтверждений и confidence.

### 13.10. `09_remediation_plan.yaml`

Roadmap группируется по горизонту:

```text
before_any_release_or_client_fork
before_C1_production
before_C2_launch
post_launch_or_planned_debt
human_architecture_decision
```

Каждый шаг содержит:

- finding refs;
- expected risk reduction;
- effort band;
- dependencies;
- verification;
- suggested owner;
- влияние на текущий и целевой release.

### 13.11. `10_justified_absences.yaml`

Условно допустимые отсутствия и срок их применимости.

### 13.12. `11_declared_vs_implemented.yaml`

Отдельно анализирует:

- честно заявленные стратегические gaps;
- скрытые тактические дефекты готового кода;
- false claims;
- documentation drift;
- системную причину расхождения;
- процессные контрмеры.

Это не приложение к findings, а самостоятельный вывод о качестве инженерного контроля.

## 14. Русские Markdown-отчёты

### `12_risk_register.ru.md`

Обязательные разделы:

1. область и легенда;
2. release blockers;
3. полный реестр по review axes;
4. кросс-подтверждённые находки;
5. findings по модулям;
6. evidence и confidence notes.

### `13_production_readiness_report.ru.md`

Обязательная композиция:

1. **Планка оценки**;
2. **Вердикт**;
3. текущая готовность C1;
4. разрыв до C2;
5. evidence-based сильные стороны;
6. блокеры выпуска;
7. зрелость модулей;
8. «заявлено vs реализовано»;
9. roadmap исправлений;
10. правомерно отсутствующее;
11. отсутствующие артефакты и ограничения;
12. итоговое release decision.

### `14_executive_summary.ru.md`

Короткий самостоятельный документ:

- вердикт одной фразой;
- контекст оценки;
- KPI;
- критичные блокеры;
- сильные стороны;
- основной системный риск;
- ближайшие действия.

Он не должен быть просто оглавлением полного отчёта.

### `16_execution_log.ru.md`

Фиксирует:

- состояние репозитория до аудита;
- что было просмотрено;
- команды и результаты;
- failed/skipped checks;
- временные side effects и cleanup;
- limitations;
- состояние репозитория после;
- итог валидации артефактов.

## 15. Требования к HTML

`15_audit_report.ru.html` — самостоятельный офлайн-артефакт, а не автоматический экспорт Markdown.

Обязательно:

- `lang="ru"` и UTF-8;
- inline CSS;
- без CDN, remote fonts, external scripts и картинок;
- responsive layout;
- print styles;
- клавиатурная навигация и видимый focus;
- внутренние anchors;
- фильтры по severity, axis, module, disclosure status и blocker horizon;
- читабельность без JavaScript;
- корректное сообщение, если фильтр ничего не нашёл.

Рекомендуемый порядок блоков:

1. metadata chips;
2. вердикт;
3. KPI cards: current critical, findings total, current blockers, target blockers, cross-confirmed findings и evidence-based strengths;
4. карточки release blockers;
5. сетка сильных сторон;
6. зрелость модулей;
7. полный реестр по осям;
8. кросс-подтверждённые findings;
9. «заявлено vs реализовано»;
10. приоритетный план;
11. правомерно отсутствующее;
12. missing artifacts и limitations;
13. метод аудита и footer.

HTML должен использовать канонические IDs и ссылаться на внутренние evidence anchors.

## 16. Что считается хорошим вердиктом

Плохой вариант:

```text
Приложение в целом хорошее, но есть риски.
```

Хороший вариант:

```text
Кодовая база имеет сильные транзакционные и модульные решения, но текущий C1 release
заблокирован из-за fail-open аутентификации, client-authoritative money path и
невоспроизводимых миграций; для C2 дополнительно отсутствует доказуемая tenant isolation.
```

Вердикт должен содержать:

- сильнейший положительный сигнал;
- главный системный риск;
- текущую readiness decision;
- target gap;
- release position.

## 17. Контроль согласованности

До завершения агент обязан проверить:

- все 18 файлов существуют;
- все YAML парсятся;
- `manifest.json` парсится;
- каждый `evidence_ref` существует;
- каждый module/requirement/finding ref валиден;
- `stable_key` не дублируются;
- counts совпадают между YAML, MD и HTML;
- release blocker IDs реально являются блокерами указанного горизонта;
- justified absence не скрывает активный текущий дефект;
- русские отчёты действительно написаны на русском;
- HTML не зависит от внешней сети;
- tracked-файлы репозитория не изменены.

`manifest.json` содержит для каждого артефакта:

- path;
- role;
- language;
- SHA-256;
- size;
- validation status.

`manifest.json` не пытается хешировать сам себя: для self-entry используется `sha256: null` и `hash_policy: excluded_to_avoid_recursive_hash`. Все остальные обязательные и дополнительные артефакты хешируются.

Если хотя бы один обязательный gate не пройден:

```text
status = blocked_output_contract
```

Агент не имеет права написать `completed`.

## 18. Финальный ответ агента в чат

В чат выводится только короткий индекс результата:

```text
Аудит завершён с файловыми артефактами.

Текущая готовность C1: C1_release_blocked
Целевая готовность C2: C1_ready_C2_blocked

Находки: critical 4, high 9, medium 16, low 8, info 5.
Блокеры: F-001, F-003, F-008, F-013.

Артефакты:
- audit-output/00_repo_inventory.yaml
- ...
- audit-output/15_audit_report.ru.html
- audit-output/manifest.json

Валидация контракта: pass.
Отслеживаемые файлы исходного кода, конфигурации, миграций, тестов и документации не изменялись.
```

Полный findings body, длинные таблицы и raw YAML в чат не вставляются.

## 19. Критерий приёмки

Аудит принимается только при одновременном выполнении трёх условий:

```text
1. findings опираются на код и evidence;
2. machine-readable YAML/JSON созданы и согласованы;
3. русские MD/HTML являются качественной человеческой витриной тех же данных.
```

Хороший текст в терминале без файлов считается незавершённым аудитом.

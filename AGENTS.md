# Инструкции для AI-агентов

Эти правила действуют для всего репозитория.

## Совместная работа и GitHub

Над проектом могут параллельно работать несколько разработчиков и AI-агентов.

- Перед началом работы выполните `git status`, `git fetch origin --prune`, `gh pr list` и просмотрите релевантные удалённые ветки/PR. Если работа пересекается с чужой, сначала изучите её актуальный diff и согласуйте границы.
- Не коммитьте и не пушьте напрямую в `main`. Изменения доставляются из отдельной рабочей ветки через pull request.
- Не пушьте в ветку другого разработчика или агента без явного согласования. Не включайте в свой коммит уже лежащие в worktree чужие изменения.
- Ветка и PR могут измениться во время ревью. Перед правками по ревью, финальной проверкой или разрешением конфликта снова сделайте `git fetch` и проверьте текущий PR/remote branch; не опирайтесь на старый локальный diff.
- Не делайте commit, push, rebase или merge, если пользователь этого явно не просил. Не удаляйте и не откатывайте чужие изменения ради «чистого» worktree.

## Критическое правило production-схемы

В `Dockerfile` намеренно используется `npx prisma db push`. **Не заменяйте его на `prisma migrate deploy`.** Прод-база исторически создана через `db push` и не имеет таблицы `_prisma_migrations`; `migrate deploy` падает с `P3005`. Поскольку `CMD` соединён через `&&`, приложение после этого не стартует, контейнер уходит в restart loop, healthcheck не проходит и зависимые `email-worker` и `hr-notification-worker` не поднимаются.

Переход на `migrate deploy` возможен только отдельной согласованной задачей после baseline существующей прод-базы. Полное обоснование и процедура: `docs/architecture/010-database-migration-strategy.md`. Проверка `scripts/deploy-guard.mjs` обязана блокировать преждевременный возврат `migrate deploy`; не ослабляйте и не удаляйте её.

При изменении Prisma-схемы поддерживайте в согласованном состоянии `prisma/schema.prisma` и `prisma/migrations/` и проверяйте drift:

```bash
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code
```

Production использует SQLite из `DATABASE_URL` (`/app/data/dev.db` в Compose), а не PostgreSQL.

## Архитектурные границы

- Перед изменением поведения прочитайте релевантный ADR в `docs/architecture/`. Принятые решения там обязательны, а не справочны.
- Бизнес-модули находятся в `src/modules/{learning,assessment,enrollment,content,course,outbox}`. Направление зависимостей: `UI/HTTP -> server composition -> infrastructure -> application -> domain`.
- `domain` должен оставаться чистым: без Next.js, React, Prisma и серверной инфраструктуры. `application` зависит от инфраструктуры только через порты. Транзакции реализуются адаптерами репозиториев; Route Handlers и Server Actions остаются тонкими адаптерами авторизации, разбора входа, вызова use case и отображения результата.
- Не возвращайте прямые Prisma-записи и бизнес-правила в UI/route/action. Не создавайте снова общий монолит `course-actions.ts`: используйте предметный адаптер и модуль-владелец. Read-side course management может объединять данные, но не мутировать их и не владеть доменными правилами.

## Next.js 16

Это не знакомый по старым версиям Next.js: в `16.2.2` есть breaking changes в API, соглашениях и структуре файлов. Перед написанием Next.js-кода прочитайте релевантный раздел локальной документации в `node_modules/next/dist/docs/` и учитывайте deprecation notices; не полагайтесь на память о предыдущих версиях.

## Файловое хранилище

- Для `public/uploads` и `public/branding` используйте `src/lib/storage`, а не ручную склейку путей. Он проверяет ключи, не допускает path traversal и корректно преобразует локальные URL.
- Для новых загрузок, где нужна дедупликация и запись метаданных `StorageFile`, используйте `putBufferDedup`/`putStreamDedup` из `src/lib/storage/dedup`. При дедупликации возвращённый `object.key` может отличаться от запрошенного — сохраняйте именно возвращённый объект.
- В Docker база, uploads и branding находятся в отдельных persistent volumes (`lms_data`, `lms_uploads`, `lms_branding`). Не считайте эти каталоги временными и не меняйте их размещение без проверки web-приложения и воркеров.

## Тесты и проверки

Скрипт `test:unit` в `package.json` содержит явный список файлов. Новый unit-тест сам не подхватится: добавьте его путь в этот скрипт вручную. Перед передачей изменений запускайте подходящий минимум из:

```bash
npm run test:unit
npm run lint
npx tsc --noEmit --incremental false
```

## SMTP и секреты

Для реальной доставки почты источник истины — deployment environment / `.env`: `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_TLS_SERVERNAME`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` и OAuth SMTP variables, если включён OAuth2.

Не меняйте и не перезаписывайте эти значения defaults из admin/platform и не печатайте секреты. При тестировании реальной доставки используйте значения окружения напрямую, если пользователь явно не попросил проверить сохранённые admin settings.

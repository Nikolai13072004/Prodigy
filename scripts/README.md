# scripts/

Служебные скрипты проекта. Большинство запускается через `npm run …`
(см. `scripts` в [package.json](../package.json)); ниже — то, что из
`package.json` не видно: рантайм, зависимости и статус.

## Python-скрипты (генераторы документации)

Три скрипта собирают презентацию и гайды из markdown-источников в `docs/`.
Рантайм — `python3`, запуск вручную (в рантайме приложения не участвуют).

| Скрипт | Вход → выход | Внешние зависимости |
|--------|--------------|---------------------|
| `build_platform_presentation.py` | `docs/aurora-lms-platform-presentation.md` → `.pptx` | `python-pptx` |
| `build_student_hr_guide_docx.py` | `docs/aurora-lms-student-hr-guide.md` → `.docx` | `python-docx` |
| `build_system_admin_guide.py` | `docs/aurora-lms-system-admin-guide.md` → `.docx` + `tmp/*.html` | нет (только stdlib) |

Установка зависимостей для первых двух:

```bash
pip install python-pptx python-docx
```

### ⚠️ Статус: осиротевшие — как есть не запускаются

На момент 2026-08-20 в репозитории:

- **нет ни одного source-файла** `docs/aurora-lms-*.md`, который эти скрипты
  читают, и нет сгенерированных `.pptx`/`.docx`;
- `ROOT` во всех трёх захардкожен как `Path("/home/team-02/lms-course3")` —
  абсолютный путь машины другого разработчика, на других системах его нет;
- pip-пакетов `python-pptx`/`python-docx` нет ни в зависимостях репозитория,
  ни в образе (в `Dockerfile` ставится только сам `python3`, без pip-пакетов).

Чтобы запустить, нужно: восстановить source-`.md` в `docs/`, заменить `ROOT` на
путь относительно скрипта (например `Path(__file__).resolve().parents[1]`) и
поставить зависимости. Пока источники не в репозитории — скрипты стоит либо
восстановить вместе с ними, либо удалить как мёртвый код. Решение за владельцем.

## Прочие скрипты

Запуск — через `npm run …`, если не указано иное.

| Файл | Назначение | Как запускается |
|------|-----------|-----------------|
| `email-worker.ts` | воркер транзакционного outbox (почта) | `npm run email:worker[:loop]` |
| `hr-notification-worker.ts` | воркер HR-уведомлений | `npm run hr:notifications[:loop]` |
| `course-reminder-worker.ts` | напоминания о курсах | `npm run course:reminders[:loop]` |
| `hr-report-schedule-worker.ts` | запланированные HR-отчёты | `npm run hr:report-schedules[:loop]` |
| `deploy-guard.mjs` | CI-guard стратегии применения схемы БД | `node scripts/deploy-guard.mjs` |
| `db-check.mjs` | проверка рабочей БД и обязательных колонок | `npm run db:check` |
| `sqlite-wal.mjs` | включение WAL для SQLite | `npm run db:wal` |
| `storage-index.ts` | переиндексация файлового хранилища | `npm run storage:index` |
| `dev-3002.sh` | фоновый dev-сервер на :3002 | `npm run dev:3002` |
| `run-unit-tests.mjs` | поиск и запуск unit-тестов обходом `src/`, `scripts/` | `npm run test:unit` |
| `e2e-web-server.mjs`, `e2e-users-scenarios.mjs` | harness для Playwright (отдельная тестовая БД) | через `npm run test:e2e` |
| `html_to_pdf.js` | HTML → PDF через Playwright Chromium (CLI) | `node scripts/html_to_pdf.js <in.html> <out.pdf>` |
| `add-quiz-and-assign-financiers.ts` | разовый seed: тест + назначение группе «Финансист» | `npx tsx scripts/add-quiz-and-assign-financiers.ts` |

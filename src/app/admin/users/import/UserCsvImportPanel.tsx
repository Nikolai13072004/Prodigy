"use client";

import { useActionState, useDeferredValue, useMemo, useState } from "react";
import { importUsersFromCsv } from "@/app/actions/user-import-actions";
import {
  INITIAL_USER_CSV_IMPORT_STATE,
  type UserCsvImportActionState,
} from "@/app/admin/users/import/user-csv-import-state";
import { Badge, Button, TD, TH, THead, TR, Table, buttonStyles } from "@/components/ui";
import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { buildUserCsvImportDraft } from "@/lib/user-csv-import";

type Props = {
  canEditAccessLevel: boolean;
  roleNames: string[];
  groupNames: string[];
  departmentNames: string[];
  organizationNames: string[];
};

function StatusBadge({
  tone,
  children,
}: {
  tone: "neutral" | "emerald" | "amber" | "rose" | "sky";
  children: React.ReactNode;
}) {
  const badgeTone =
    tone === "emerald"
      ? "success"
      : tone === "amber"
        ? "warning"
        : tone === "rose"
          ? "danger"
          : tone === "sky"
            ? "info"
            : "neutral";

  return <Badge tone={badgeTone}>{children}</Badge>;
}

function ResultBanner({ state }: { state: UserCsvImportActionState }) {
  if (!state.message || !state.summary) return null;

  const className =
    state.status === "error"
      ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : state.summary.errorCount > 0
        ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
        : "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${className}`}>
      <p>{state.message}</p>
      <p className="mt-1 text-xs">
        Всего строк: {state.summary.totalRows} · Импортировано: {state.summary.importedCount} · Ошибок:{" "}
        {state.summary.errorCount} · Писем в очереди: {state.summary.queuedEmailsCount}
      </p>
    </div>
  );
}

function sampleCsv(canEditAccessLevel: boolean) {
  const headers = canEditAccessLevel
    ? ["email", "firstName", "lastName", "login", "role", "group", "department", "organization"]
    : ["email", "firstName", "lastName", "group", "department", "organization"];
  const rows = canEditAccessLevel
    ? [
        "irina@example.com,Ирина,Кузнецова,irina.k,Ученик,Финансисты,Финансы,Альфа",
        "oleg@example.com,Олег,Петров,,Разработчик курсов,,,Бета",
      ]
    : ["employee@example.com,Сотрудник,Импорт,Финансисты,Финансы,Альфа"];

  return [headers.join(","), ...rows].join("\n");
}

export function UserCsvImportPanel({
  canEditAccessLevel,
  roleNames,
  groupNames,
  departmentNames,
  organizationNames,
}: Props) {
  const [csvText, setCsvText] = useState(sampleCsv(canEditAccessLevel));
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(importUsersFromCsv, INITIAL_USER_CSV_IMPORT_STATE);
  const deferredCsvText = useDeferredValue(csvText);
  const preview = useMemo(
    () =>
      buildUserCsvImportDraft({
        csvText: deferredCsvText,
        canEditAccessLevel,
        roleNames,
        groupNames,
        departmentNames,
        organizationNames,
      }),
    [canEditAccessLevel, deferredCsvText, departmentNames, groupNames, organizationNames, roleNames]
  );
  const hasGlobalIssues = preview.issues.length > 0;
  const canSubmit = !pending && !hasGlobalIssues && preview.summary.readyRows > 0;
  const previewRows = preview.rows.slice(0, 20);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form action={formAction} className="rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)]">Импорт пользователей из CSV</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Загрузите CSV-файл или вставьте его содержимое. Перед импортом система покажет preview и повторно проверит
              каждую строку на сервере.
            </p>
          </div>

          <StatusBadge tone="sky">{preview.delimiter === ";" ? "Разделитель: ;" : "Разделитель: ,"}</StatusBadge>
        </div>

        <div className="mt-5 grid gap-5">
          <div className="block">
            <span className="block text-sm font-medium text-[var(--ink)]">CSV-файл</span>
            <label className={buttonStyles("primary", "md", "mt-2 cursor-pointer")}>
              Выбрать файл
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFileName(file.name);
                  setCsvText(await file.text());
                }}
              />
            </label>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              {fileName ? `Загружен файл: ${fileName}` : "Можно использовать как CSV с запятыми, так и CSV с точкой с запятой."}
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">CSV-содержимое</span>
            <textarea
              name="csvContent"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={12}
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-mono text-sm outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
        </div>

        {preview.issues.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            {preview.issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatusBadge tone="neutral">Строк: {preview.summary.totalRows}</StatusBadge>
          <StatusBadge tone="emerald">Готово к импорту: {preview.summary.readyRows}</StatusBadge>
          <StatusBadge tone="rose">С ошибками: {preview.summary.errorRows}</StatusBadge>
          <StatusBadge tone="amber">С предупреждениями: {preview.summary.warningRows}</StatusBadge>
          {!canEditAccessLevel ? <StatusBadge tone="sky">Роль для всех строк: {STANDARD_ROLE_NAMES.STUDENT}</StatusBadge> : null}
        </div>

        <div className="mt-6">
          <Button type="submit" disabled={!canSubmit}>
            {pending ? "Импортируем..." : `Импортировать ${preview.summary.readyRows} строк`}
          </Button>
        </div>

        {state.status !== "idle" ? (
          <div className="mt-6 space-y-4">
            <ResultBanner state={state} />

            {state.rows.length > 0 ? (
              <Table className="min-w-full">
                <THead>
                  <TR>
                    <TH>Строка</TH>
                    <TH>Пользователь</TH>
                    <TH>Статус</TH>
                    <TH>Результат</TH>
                  </TR>
                </THead>
                <tbody>
                  {state.rows.map((row) => (
                    <TR key={`${row.rowNumber}-${row.email}-${row.status}`} className="align-top">
                      <TD className="text-[var(--ink-muted)]">{row.rowNumber}</TD>
                      <TD>
                        <div className="font-medium text-[var(--ink)]">{row.name || "Без имени"}</div>
                        <div className="mt-1 text-xs text-[var(--ink-muted)]">
                          {row.email} · {row.login}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.roles.map((role) => (
                            <StatusBadge key={`${row.rowNumber}-${role}`} tone="neutral">
                              {role}
                            </StatusBadge>
                          ))}
                        </div>
                      </TD>
                      <TD>
                        <StatusBadge tone={row.status === "imported" ? "emerald" : "rose"}>
                          {row.status === "imported" ? "Импортирован" : "Ошибка"}
                        </StatusBadge>
                      </TD>
                      <TD className="text-[var(--ink)]">{row.detail}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </div>
        ) : null}
      </form>

      <aside className="space-y-6">
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Предпросмотр</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Показаны первые {Math.min(previewRows.length, 20)} строк. Ошибки в preview не блокируют частичный импорт
            остальных валидных записей.
          </p>

          {previewRows.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink-muted)]">Добавьте CSV, чтобы увидеть preview строк.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {previewRows.map((row) => (
                <div key={`${row.rowNumber}-${row.email}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--ink)]">Строка {row.rowNumber}</span>
                    <StatusBadge tone={row.issues.length > 0 ? "rose" : "emerald"}>
                      {row.issues.length > 0 ? "Есть ошибки" : "Готово"}
                    </StatusBadge>
                    {row.warnings.length > 0 ? <StatusBadge tone="amber">Есть предупреждения</StatusBadge> : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--ink)]">
                    {row.name || "Без имени"} · {row.email || "без email"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Логин: {row.login || "не определен"}
                    {row.groupName ? ` · Группа: ${row.groupName}` : ""}
                    {row.departmentName ? ` · Подразделение: ${row.departmentName}` : ""}
                    {row.organizationName ? ` · Организация: ${row.organizationName}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.roles.map((role) => (
                      <StatusBadge key={`${row.rowNumber}-preview-${role}`} tone="neutral">
                        {role}
                      </StatusBadge>
                    ))}
                  </div>
                  {row.issues.length > 0 ? (
                    <div className="mt-3 space-y-1 text-xs text-[var(--danger)]">
                      {row.issues.map((issue) => (
                        <p key={`${row.rowNumber}-${issue}`}>{issue}</p>
                      ))}
                    </div>
                  ) : null}
                  {row.warnings.length > 0 ? (
                    <div className="mt-3 space-y-1 text-xs text-[var(--warning)]">
                      {row.warnings.map((warning) => (
                        <p key={`${row.rowNumber}-${warning}`}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {preview.rows.length > previewRows.length ? (
                <p className="text-xs text-[var(--ink-muted)]">Еще строк в preview: {preview.rows.length - previewRows.length}</p>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Формат CSV</h2>
          <div className="mt-3 space-y-3 text-sm text-[var(--ink-muted)]">
            <p>Обязательные колонки: `email`, `firstName`.</p>
            <p>Необязательные колонки: `lastName`, `login`, `role`, `group`, `department`, `organization`.</p>
            <p>
              {canEditAccessLevel
                ? "Если `login` пустой, система создаст его автоматически из email. Если `role` не указан, назначится роль ученика."
                : "HR-импорт создает только учеников и отправляет письмо с временным паролем."}
            </p>
          </div>

          <pre className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs text-[var(--ink)]">
            {sampleCsv(canEditAccessLevel)}
          </pre>
        </section>

        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Справочники</h2>
          <div className="mt-4 space-y-4 text-sm text-[var(--ink-muted)]">
            <div>
              <p className="font-medium text-[var(--ink)]">Роли</p>
              <p className="mt-1">{canEditAccessLevel ? roleNames.join(", ") || "Нет ролей" : STANDARD_ROLE_NAMES.STUDENT}</p>
            </div>
            <div>
              <p className="font-medium text-[var(--ink)]">Группы</p>
              <p className="mt-1">{groupNames.join(", ") || "Нет групп"}</p>
            </div>
            <div>
              <p className="font-medium text-[var(--ink)]">Подразделения</p>
              <p className="mt-1">{departmentNames.join(", ") || "Нет подразделений"}</p>
            </div>
            <div>
              <p className="font-medium text-[var(--ink)]">Организации</p>
              <p className="mt-1">{organizationNames.join(", ") || "Нет организаций"}</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

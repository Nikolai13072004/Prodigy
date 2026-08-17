"use client";

import { useActionState, useDeferredValue, useMemo, useState } from "react";
import { importUsersFromCsv } from "@/app/actions/user-import-actions";
import {
  INITIAL_USER_CSV_IMPORT_STATE,
  type UserCsvImportActionState,
} from "@/app/admin/users/import/user-csv-import-state";
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
  const className =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "sky"
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>
  );
}

function ResultBanner({ state }: { state: UserCsvImportActionState }) {
  if (!state.message || !state.summary) return null;

  const className =
    state.status === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : state.summary.errorCount > 0
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

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
      <form action={formAction} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Импорт пользователей из CSV</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Загрузите CSV-файл или вставьте его содержимое. Перед импортом система покажет preview и повторно проверит
              каждую строку на сервере.
            </p>
          </div>

          <StatusBadge tone="sky">{preview.delimiter === ";" ? "Разделитель: ;" : "Разделитель: ,"}</StatusBadge>
        </div>

        <div className="mt-5 grid gap-5">
          <label className="block">
            <span className="text-sm font-medium text-zinc-900">CSV-файл</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-2 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setCsvText(await file.text());
              }}
            />
            <p className="mt-2 text-xs text-zinc-500">
              {fileName ? `Загружен файл: ${fileName}` : "Можно использовать как CSV с запятыми, так и CSV с точкой с запятой."}
            </p>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-900">CSV-содержимое</span>
            <textarea
              name="csvContent"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={12}
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-3 font-mono text-sm outline-none ring-teal-500 focus:ring-2"
            />
          </label>
        </div>

        {preview.issues.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Импортируем..." : `Импортировать ${preview.summary.readyRows} строк`}
          </button>
        </div>

        {state.status !== "idle" ? (
          <div className="mt-6 space-y-4">
            <ResultBanner state={state} />

            {state.rows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Строка</th>
                        <th className="px-4 py-3">Пользователь</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3">Результат</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {state.rows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.email}-${row.status}`} className="align-top">
                          <td className="px-4 py-3 text-zinc-500">{row.rowNumber}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-950">{row.name || "Без имени"}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {row.email} · {row.login}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {row.roles.map((role) => (
                                <StatusBadge key={`${row.rowNumber}-${role}`} tone="neutral">
                                  {role}
                                </StatusBadge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={row.status === "imported" ? "emerald" : "rose"}>
                              {row.status === "imported" ? "Импортирован" : "Ошибка"}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{row.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      <aside className="space-y-6">
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Предпросмотр</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Показаны первые {Math.min(previewRows.length, 20)} строк. Ошибки в preview не блокируют частичный импорт
            остальных валидных записей.
          </p>

          {previewRows.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Добавьте CSV, чтобы увидеть preview строк.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {previewRows.map((row) => (
                <div key={`${row.rowNumber}-${row.email}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-950">Строка {row.rowNumber}</span>
                    <StatusBadge tone={row.issues.length > 0 ? "rose" : "emerald"}>
                      {row.issues.length > 0 ? "Есть ошибки" : "Готово"}
                    </StatusBadge>
                    {row.warnings.length > 0 ? <StatusBadge tone="amber">Есть предупреждения</StatusBadge> : null}
                  </div>
                  <p className="mt-2 text-sm text-zinc-800">
                    {row.name || "Без имени"} · {row.email || "без email"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
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
                    <div className="mt-3 space-y-1 text-xs text-rose-700">
                      {row.issues.map((issue) => (
                        <p key={`${row.rowNumber}-${issue}`}>{issue}</p>
                      ))}
                    </div>
                  ) : null}
                  {row.warnings.length > 0 ? (
                    <div className="mt-3 space-y-1 text-xs text-amber-800">
                      {row.warnings.map((warning) => (
                        <p key={`${row.rowNumber}-${warning}`}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {preview.rows.length > previewRows.length ? (
                <p className="text-xs text-zinc-500">Еще строк в preview: {preview.rows.length - previewRows.length}</p>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Формат CSV</h2>
          <div className="mt-3 space-y-3 text-sm text-zinc-600">
            <p>Обязательные колонки: `email`, `firstName`.</p>
            <p>Необязательные колонки: `lastName`, `login`, `role`, `group`, `department`, `organization`.</p>
            <p>
              {canEditAccessLevel
                ? "Если `login` пустой, система создаст его автоматически из email. Если `role` не указан, назначится роль ученика."
                : "HR-импорт создает только учеников и отправляет письмо с временным паролем."}
            </p>
          </div>

          <pre className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
            {sampleCsv(canEditAccessLevel)}
          </pre>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Справочники</h2>
          <div className="mt-4 space-y-4 text-sm text-zinc-600">
            <div>
              <p className="font-medium text-zinc-900">Роли</p>
              <p className="mt-1">{canEditAccessLevel ? roleNames.join(", ") || "Нет ролей" : STANDARD_ROLE_NAMES.STUDENT}</p>
            </div>
            <div>
              <p className="font-medium text-zinc-900">Группы</p>
              <p className="mt-1">{groupNames.join(", ") || "Нет групп"}</p>
            </div>
            <div>
              <p className="font-medium text-zinc-900">Подразделения</p>
              <p className="mt-1">{departmentNames.join(", ") || "Нет подразделений"}</p>
            </div>
            <div>
              <p className="font-medium text-zinc-900">Организации</p>
              <p className="mt-1">{organizationNames.join(", ") || "Нет организаций"}</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

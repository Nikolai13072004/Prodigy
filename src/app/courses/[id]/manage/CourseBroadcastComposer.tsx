"use client";

import { useState } from "react";
import type {
  CourseBroadcastAudienceGroup,
  CourseBroadcastAudienceRecipient,
} from "@/lib/course-broadcasts";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  recipients: CourseBroadcastAudienceRecipient[];
  groups: CourseBroadcastAudienceGroup[];
  summary: {
    eligibleRecipientsCount: number;
    totalAssignedLearnersCount: number;
    skippedWithoutEmailCount: number;
    skippedInactiveCount: number;
  };
};

export function CourseBroadcastComposer({ action, recipients, groups, summary }: Props) {
  const [messageScope, setMessageScope] = useState<"course" | "group">("course");
  const [messageGroupId, setMessageGroupId] = useState(groups[0]?.id ?? "");

  const previewRecipients =
    messageScope === "group"
      ? recipients.filter((recipient) => recipient.assignedGroupIds.includes(messageGroupId))
      : recipients;
  const submitDisabled = previewRecipients.length === 0 || (messageScope === "group" && !messageGroupId);

  return (
    <section id="course-messaging" className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-950">Отправить сообщение ученикам</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Сообщение уйдет в email-очередь только активным ученикам с указанным email.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
            К отправке: {summary.eligibleRecipientsCount}
          </span>
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-zinc-600">
            Всего записано: {summary.totalAssignedLearnersCount}
          </span>
          {summary.skippedWithoutEmailCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
              Без email: {summary.skippedWithoutEmailCount}
            </span>
          ) : null}
          {summary.skippedInactiveCount > 0 ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
              Неактивные: {summary.skippedInactiveCount}
            </span>
          ) : null}
        </div>
      </div>

      <form action={action} className="mt-5 space-y-5">
        <input type="hidden" name="messageScope" value={messageScope} />
        <input type="hidden" name="messageGroupId" value={messageScope === "group" ? messageGroupId : ""} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <label className="block text-sm font-medium text-zinc-700">
                Получатели
                <select
                  value={messageScope}
                  onChange={(event) => {
                    const nextScope = event.target.value === "group" ? "group" : "course";
                    setMessageScope(nextScope);
                    if (nextScope === "group" && !messageGroupId && groups[0]) {
                      setMessageGroupId(groups[0].id);
                    }
                  }}
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
                >
                  <option value="course">Все ученики курса</option>
                  <option value="group" disabled={groups.length === 0}>
                    Только ученики выбранной группы
                  </option>
                </select>
              </label>

              <label className="block text-sm font-medium text-zinc-700">
                Группа
                <select
                  value={messageGroupId}
                  onChange={(event) => setMessageGroupId(event.target.value)}
                  disabled={messageScope !== "group" || groups.length === 0}
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:cursor-default disabled:bg-zinc-100"
                >
                  {groups.length === 0 ? (
                    <option value="">Нет назначенных групп</option>
                  ) : (
                    groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.eligibleRecipientsCount})
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium text-zinc-700">
              Тема сообщения
              <input
                name="messageSubject"
                maxLength={200}
                placeholder="Например: Напоминание о дедлайне по курсу"
                className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700">
              Текст сообщения
              <textarea
                name="messageBody"
                rows={8}
                maxLength={5000}
                placeholder="Опишите новость, напоминание или дедлайн. Каждый перенос строки сохранится в письме."
                className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
              <span>
                В preview ниже попадают только ученики, которым письмо реально уйдет: активные аккаунты с email.
              </span>
              <button
                type="submit"
                disabled={submitDisabled}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-default disabled:opacity-60"
              >
                Отправить сообщение
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h4 className="text-sm font-semibold text-zinc-950">Предпросмотр получателей</h4>
            <p className="mt-1 text-xs text-zinc-500">
              Сейчас в рассылку попадет {previewRecipients.length} учеников.
            </p>
            <div className="mt-4 space-y-2">
              {previewRecipients.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                  По выбранному фильтру нет подходящих получателей.
                </p>
              ) : (
                previewRecipients.slice(0, 8).map((recipient) => (
                  <div key={recipient.id} className="rounded-xl border border-zinc-200 px-3 py-3">
                    <div className="text-sm font-medium text-zinc-950">{recipient.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {recipient.login} · {recipient.email}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {recipient.assignmentSource === "mixed"
                        ? `Личное назначение и группы: ${recipient.assignedGroupNames.join(", ")}`
                        : recipient.assignmentSource === "group"
                          ? `Через группы: ${recipient.assignedGroupNames.join(", ")}`
                          : "Личное назначение"}
                    </div>
                  </div>
                ))
              )}
            </div>
            {previewRecipients.length > 8 ? (
              <p className="mt-3 text-xs text-zinc-500">И еще {previewRecipients.length - 8} получателей в очереди.</p>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <h4 className="text-sm font-semibold text-zinc-950">Список получателей</h4>
          </div>
          {previewRecipients.length === 0 ? (
            <div className="px-4 py-8 text-sm text-zinc-500">Подходящих учеников нет.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Ученик</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Подразделение</th>
                    <th className="px-4 py-3 text-left font-medium">Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRecipients.map((recipient) => (
                    <tr key={recipient.id} className="border-t border-zinc-200 align-top text-zinc-700">
                      <td className="px-4 py-4">
                        <div className="font-medium text-zinc-950">{recipient.name}</div>
                        <div className="mt-1 text-xs text-zinc-500">{recipient.login}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-zinc-600">{recipient.email}</td>
                      <td className="px-4 py-4 text-sm text-zinc-600">{recipient.department}</td>
                      <td className="px-4 py-4 text-sm text-zinc-600">
                        {recipient.assignmentSource === "mixed"
                          ? `Лично и через группы: ${recipient.assignedGroupNames.join(", ")}`
                          : recipient.assignmentSource === "group"
                            ? `Группы: ${recipient.assignedGroupNames.join(", ")}`
                            : "Личное назначение"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </form>
    </section>
  );
}

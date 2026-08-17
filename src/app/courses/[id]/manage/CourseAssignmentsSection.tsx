import Link from "next/link";

import { sendCourseBroadcastMessage, setCourseAssignments } from "@/app/actions/course-enrollment-actions";
import { AssignmentsManager } from "./AssignmentsManager";
import { CourseBroadcastComposer } from "./CourseBroadcastComposer";
import { CourseModalAutoClose } from "./CourseModalAutoClose";
import type { CourseManagementData } from "./_queries/get-course-management-data";
import type { CourseAssignmentDirectory } from "./_queries/select-course-assignments";

type Props = {
  courseId: string;
  courseStatus: string;
  canManageAssignments: boolean;
  canOpenAccessSection: boolean;
  messagingOpen: boolean;
  directory: CourseAssignmentDirectory;
  broadcastAudience: CourseManagementData["broadcastAudience"];
  messages: {
    assignmentSaved?: string;
    assignmentError?: string;
    assignmentWarning?: string;
    messageSaved?: string;
    messageError?: string;
  };
};

export function CourseAssignmentsSection({
  courseId,
  courseStatus,
  canManageAssignments,
  canOpenAccessSection,
  messagingOpen,
  directory,
  broadcastAudience,
  messages,
}: Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-zinc-950">Назначения</h2>
      <AssignmentMessages messages={messages} />

      {courseStatus === "PUBLISHED" && canManageAssignments ? (
        <>
          <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h3 className="text-base font-semibold text-zinc-950">Коммуникация с учениками</h3>
              <Link
                href={`/courses/${courseId}/manage?section=assignments&messaging=1`}
                className="inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Отправить сообщение
              </Link>
            </div>
          </section>
          {messagingOpen ? (
            <MessagingDialog
              courseId={courseId}
              audience={broadcastAudience}
              messageError={messages.messageError}
            />
          ) : null}
        </>
      ) : null}

      {courseStatus !== "PUBLISHED" ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-6">
          <h3 className="text-base font-semibold text-zinc-950">Назначения недоступны</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Назначать пользователей и группы можно только после публикации курса.
          </p>
          {canOpenAccessSection ? (
            <Link
              href={`/courses/${courseId}/manage?section=access`}
              className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Перейти к публикации
            </Link>
          ) : (
            <p className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
              Публикация доступна автору или администратору курса.
            </p>
          )}
        </div>
      ) : canManageAssignments ? (
        <AssignmentsManager
          action={setCourseAssignments.bind(null, courseId)}
          users={directory.users}
          groups={directory.groups}
          pendingInviteEmails={directory.pendingInviteEmails}
          initialSelectedUserIds={[]}
          initialSelectedGroupIds={[]}
          initiallyAssignedUserIds={directory.initiallyAssignedUserIds}
          initiallyAssignedGroupIds={directory.initiallyAssignedGroupIds}
          currentAccessLabel={directory.accessLabel}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 px-4 py-5 text-sm text-zinc-600">
          Для изменения назначений нужны права управления назначениями курса.
        </p>
      )}
    </div>
  );
}

function AssignmentMessages({ messages }: { messages: Props["messages"] }) {
  const items = [
    { value: messages.assignmentSaved, tone: "emerald" },
    { value: messages.assignmentError, tone: "red" },
    { value: messages.assignmentWarning, tone: "amber" },
    { value: messages.messageSaved, tone: "emerald" },
    { value: messages.messageError, tone: "red" },
  ] as const;

  return items.map(({ value, tone }, index) =>
    value ? (
      <p
        key={`${tone}-${index}`}
        className={`rounded-xl border px-3 py-2 text-sm ${
          tone === "emerald"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : tone === "amber"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        {value}
      </p>
    ) : null
  );
}

function MessagingDialog({
  courseId,
  audience,
  messageError,
}: {
  courseId: string;
  audience: Props["broadcastAudience"];
  messageError?: string;
}) {
  return (
    <div className="admin-content-modal fixed z-50 flex items-center justify-center p-4">
      <CourseModalAutoClose href={`/courses/${courseId}/manage?section=assignments`} />
      <Link
        href={`/courses/${courseId}/manage?section=assignments`}
        aria-label="Закрыть редактор сообщения"
        className="absolute inset-0 bg-zinc-950/50"
      >
        <span className="sr-only">Закрыть редактор сообщения</span>
      </Link>
      <div className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Коммуникация с учениками</p>
            <h3 className="mt-1 text-xl font-semibold text-zinc-950">Отправить сообщение</h3>
          </div>
          <Link href={`/courses/${courseId}/manage?section=assignments`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
            Закрыть
          </Link>
        </div>
        <div className="p-6">
          {messageError ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{messageError}</p> : null}
          <CourseBroadcastComposer
            action={sendCourseBroadcastMessage.bind(null, courseId)}
            recipients={audience?.recipients ?? []}
            groups={audience?.groups ?? []}
            summary={audience?.summary ?? { eligibleRecipientsCount: 0, totalAssignedLearnersCount: 0, skippedWithoutEmailCount: 0, skippedInactiveCount: 0 }}
          />
        </div>
      </div>
    </div>
  );
}

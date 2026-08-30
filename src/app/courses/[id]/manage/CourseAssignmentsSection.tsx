import Link from "next/link";

import { sendCourseBroadcastMessage, setCourseAssignments } from "@/app/actions/course-enrollment-actions";
import { buttonStyles } from "@/components/ui";
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
      <h2 className="text-xl font-semibold text-[var(--ink)]">Назначения</h2>
      <AssignmentMessages messages={messages} />

      {courseStatus === "PUBLISHED" && canManageAssignments ? (
        <>
          <section className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h3 className="text-base font-semibold text-[var(--ink)]">Коммуникация с учениками</h3>
              <Link
                href={`/courses/${courseId}/manage?section=assignments&messaging=1`}
                className={buttonStyles("primary")}
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
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <h3 className="text-base font-semibold text-[var(--ink)]">Назначения недоступны</h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Назначать пользователей и группы можно только после публикации курса.
          </p>
          {canOpenAccessSection ? (
            <Link
              href={`/courses/${courseId}/manage?section=access`}
              className={buttonStyles("primary", "md", "mt-4")}
            >
              Перейти к публикации
            </Link>
          ) : (
            <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--ink-muted)]">
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
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--ink-muted)]">
          Для изменения назначений нужны права управления назначениями курса.
        </p>
      )}
    </div>
  );
}

function AssignmentMessages({ messages }: { messages: Props["messages"] }) {
  const items = [
    { value: messages.assignmentSaved, tone: "success" },
    { value: messages.assignmentError, tone: "danger" },
    { value: messages.assignmentWarning, tone: "warning" },
    { value: messages.messageSaved, tone: "success" },
    { value: messages.messageError, tone: "danger" },
  ] as const;

  return items.map(({ value, tone }, index) =>
    value ? (
      <p
        key={`${tone}-${index}`}
        className={`rounded-xl border px-3 py-2 text-sm ${
          tone === "success"
            ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
            : tone === "warning"
              ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
              : "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
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
        className="absolute inset-0 bg-black/50"
      >
        <span className="sr-only">Закрыть редактор сообщения</span>
      </Link>
      <div className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-raised)] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--success)]">Коммуникация с учениками</p>
            <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">Отправить сообщение</h3>
          </div>
          <Link href={`/courses/${courseId}/manage?section=assignments`} className={buttonStyles("secondary")}>
            Закрыть
          </Link>
        </div>
        <div className="p-6">
          {messageError ? <p className="mb-4 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{messageError}</p> : null}
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

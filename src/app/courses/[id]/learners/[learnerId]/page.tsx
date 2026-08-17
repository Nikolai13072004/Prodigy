import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unenrollCourseLearner, updateCourseLearnerAccess } from "@/app/actions/course-enrollment-actions";
import { blockLearnerAsHr } from "@/app/actions/hr-learner-actions";
import { CourseLearnerUnenrollDialog } from "@/components/CourseLearnerUnenrollDialog";
import { requireSession } from "@/lib/auth-guards";
import { toCourseAccessDateInputValue } from "@/lib/course-access-window";
import { getCourseLearnerDetailData } from "@/lib/course-learner-detail";
import { formatDateTimeRu } from "@/lib/course-learners";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

type Props = {
  params: Promise<{ id: string; learnerId: string }>;
  searchParams: Promise<{ accessSaved?: string; accessError?: string }>;
};

export default async function CourseLearnerDetailPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id: courseId, learnerId } = await params;
  const sp = await searchParams;
  const canEditLearnerProfile = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_PROFILE,
    session.user.permissions
  );

  const data = await getCourseLearnerDetailData({
    courseId,
    learnerId,
    user: session.user,
  });

  if (!data) notFound();
  if (!data.access.canViewLearners) redirect("/");

  const exactAccessDateValue = data.learner.accessExpiresAt
    ? toCourseAccessDateInputValue(data.learner.accessExpiresAt)
    : "";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-teal-700">
            <Link href={`/courses/${data.course.id}/learners`} className="underline">
              ← Ученики курса
            </Link>
            <span>·</span>
            <Link href={`/courses/${data.course.id}/results`} className="underline">
              Результаты курса
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{data.learner.name}</h1>
            <StatusBadge
              label={data.learner.accountStatusLabel}
              tone={data.learner.accountStatus === "ACTIVE" ? "neutral" : "warning"}
            />
            <CourseStatusBadge status={data.course.status} />
          </div>

          <p className="mt-2 text-sm text-zinc-600">
            Курс: <span className="font-medium text-zinc-900">{data.course.title}</span>
          </p>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            {data.course.description || "Описание курса пока не заполнено."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {canEditLearnerProfile ? (
            <Link
              href={`/admin/users/${data.learner.id}/edit`}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Редактировать профиль
            </Link>
          ) : null}
          {data.access.canManageAssignments ? (
            <Link
              href={`/courses/${data.course.id}/manage?section=assignments`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Назначения
            </Link>
          ) : null}
          {data.access.canOpenManage ? (
            <Link
              href={`/courses/${data.course.id}/manage?section=reports`}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Управление курсом
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <SummaryCard label="Общий прогресс" value={`${data.progress.percent}%`} />
        <SummaryCard
          label="Пройдено этапов"
          value={`${data.progress.completedRequired}/${data.progress.requiredTotal || 0}`}
        />
        <SummaryCard
          label="Источник назначения"
          value={data.learner.assignmentSource}
          compact
        />
        <SummaryCard
          label="Последняя активность"
          value={data.learner.lastActivityAt ? formatDateTimeRu(data.learner.lastActivityAt) : "Нет"}
          compact
        />
        <SummaryCard
          label="Доступ к курсу"
          value={getAccessSummaryValue(data.learner)}
          compact
        />
      </section>

      {sp.accessSaved ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sp.accessSaved}
        </div>
      ) : null}
      {sp.accessError ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.accessError}
        </div>
      ) : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Карточка ученика</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <InfoRow label="Логин" value={data.learner.login} />
              <InfoRow label="Email" value={data.learner.email ?? "Не указан"} />
              <InfoRow label="Подразделение" value={data.learner.department} />
              <InfoRow
                label="Группы"
                value={data.learner.groups.length ? data.learner.groups.join(", ") : "Нет групп"}
              />
              <InfoRow
                label="Группы назначения"
                value={data.learner.assignedGroups.length ? data.learner.assignedGroups.join(", ") : "Нет"}
              />
              <InfoRow
                label="Назначен"
                value={data.learner.assignedAt ? formatDateTimeRu(data.learner.assignedAt) : "—"}
              />
            </dl>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">Доступ к курсу</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Текущий статус доступа, быстрые продления и ручная установка точной даты.
                </p>
              </div>
              <StatusBadge
                label={data.learner.accessStateLabel}
                tone={data.learner.accessState === "active" ? "success" : "warning"}
              />
            </div>

            <dl className="mt-4 space-y-4 text-sm">
              <InfoRow label="Состояние" value={data.learner.accessStateLabel} />
              <InfoRow
                label="Срок доступа"
                value={
                  data.learner.hasUnlimitedAccess
                    ? "Без ограничения по сроку"
                    : data.learner.accessExpiresAt
                      ? formatDateTimeRu(data.learner.accessExpiresAt)
                      : "—"
                }
              />
            </dl>

            {data.accessAudit ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-amber-800">
                  Последнее изменение доступа
                </div>
                <dl className="mt-3 space-y-3 text-sm">
                  <InfoRow label="Когда" value={formatDateTimeRu(data.accessAudit.changedAt)} />
                  <InfoRow label="Кем" value={data.accessAudit.actorName} />
                  <InfoRow label="Было" value={data.accessAudit.previousAccessLabel} />
                  <InfoRow label="Стало" value={data.accessAudit.nextAccessLabel} />
                </dl>
              </div>
            ) : null}

            {data.access.canManageAssignments ? (
              <div className="mt-5 space-y-3">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Быстрые действия</div>
                <div className="flex flex-wrap gap-2">
                  {[30, 60, 90].map((days) => (
                    <form
                      key={days}
                      action={updateCourseLearnerAccess.bind(null, data.course.id, data.learner.id)}
                    >
                      <input type="hidden" name="mode" value="EXTEND" />
                      <input type="hidden" name="days" value={String(days)} />
                      <button
                        type="submit"
                        disabled={data.learner.hasUnlimitedAccess}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Продлить на {days} дней
                      </button>
                    </form>
                  ))}
                  {!data.learner.hasUnlimitedAccess ? (
                    <form action={updateCourseLearnerAccess.bind(null, data.course.id, data.learner.id)}>
                      <input type="hidden" name="mode" value="UNLIMITED" />
                      <button
                        type="submit"
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Сделать бессрочным
                      </button>
                    </form>
                  ) : null}
                </div>
                <form
                  action={updateCourseLearnerAccess.bind(null, data.course.id, data.learner.id)}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <input type="hidden" name="mode" value="SET_DATE" />
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-700">Точная дата окончания доступа</span>
                      <input
                        type="date"
                        name="accessExpiresOn"
                        defaultValue={exactAccessDateValue}
                        className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none ring-emerald-500 focus:ring-2"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                    >
                      Установить дату
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    Этой формой можно перевести даже бессрочный доступ в доступ до выбранной даты.
                  </p>
                </form>
              </div>
            ) : null}
          </div>

          {data.access.canManageAssignments ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-950">Отчисление с курса</h2>
                  <p className="mt-1 text-sm text-rose-800">
                    Подтверждение попросит выбрать, нужно ли удалить прогресс по этому курсу.
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm text-rose-900">
                После отчисления ученик потеряет доступ к контенту курса и может лишиться сертификата. При желании можно
                сохранить прогресс для аудита или очистить его полностью только в рамках этого курса.
              </p>

              <div className="mt-4">
                <CourseLearnerUnenrollDialog
                  action={unenrollCourseLearner.bind(null, data.course.id, data.learner.id)}
                  learnerName={data.learner.name}
                  courseTitle={data.course.title}
                  buttonLabel="Отчислить ученика"
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">Доступ к платформе</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Если сотрудник больше не должен входить в систему, его можно заблокировать без потери истории обучения.
                </p>
              </div>
              <StatusBadge
                label={data.learner.accountStatusLabel}
                tone={data.learner.accountStatus === "ACTIVE" ? "neutral" : "warning"}
              />
            </div>

            <p className="mt-4 text-sm text-zinc-600">
              После блокировки ученик исчезнет из активных списков курса и будет доступен в архиве HR-отчетов.
            </p>

            <form action={blockLearnerAsHr.bind(null, data.learner.id, data.course.id)} className="mt-4">
              <button
                type="submit"
                disabled={data.learner.accountStatus !== "ACTIVE" && data.learner.accountStatus !== "PENDING"}
                className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Заблокировать ученика
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Элементы курса</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Детальный статус по материалам и тестам ученика в этом курсе.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
              {data.itemDetails.length} элементов
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {data.itemDetails.map((item) => (
              <article key={item.id} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-zinc-950">{item.title}</h3>
                      <StatusBadge label={getItemTypeLabel(item.type)} tone="neutral" />
                      {item.isRequired ? <StatusBadge label="Обязательный" tone="info" /> : null}
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      Статус: <span className="font-medium text-zinc-700">{item.statusLabel}</span>
                      {item.viewedAt ? ` · Последняя активность: ${formatDateTimeRu(item.viewedAt)}` : ""}
                    </p>
                  </div>
                  <div className="min-w-[180px]">
                    <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                      <span>Прогресс</span>
                      <span>{item.progressPercent}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-zinc-200">
                      <div
                        className="h-2 rounded-full bg-emerald-600"
                        style={{ width: `${Math.max(0, Math.min(item.progressPercent, 100))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {item.quizSummary ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <MiniMetric
                      label="Лучшая попытка"
                      value={
                        item.quizSummary.maxScore > 0
                          ? `${item.quizSummary.bestScore}/${item.quizSummary.maxScore}`
                          : "—"
                      }
                    />
                    <MiniMetric
                      label="Лучший результат"
                      value={
                        item.quizSummary.maxScore > 0 ? `${item.quizSummary.bestScorePercent}%` : "—"
                      }
                    />
                    <MiniMetric
                      label="Попытки"
                      value={`${item.quizSummary.attemptsUsed} / ${item.quizSummary.attemptsUsed + item.quizSummary.attemptsLeft}`}
                    />
                    <MiniMetric
                      label="Статус теста"
                      value={item.quizSummary.statusLabel}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Результаты тестов и заданий</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Последние оценки по каждому тесту и заданию курса, включая порог прохождения и комментарии проверяющего.
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
            {data.assessmentDetails.length} элементов
          </span>
        </div>

        {data.assessmentDetails.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-6 text-center text-sm text-zinc-600">
            В этом курсе пока нет тестов или заданий с оценкой.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Элемент</th>
                  <th className="px-4 py-3 text-left font-medium">Тип</th>
                  <th className="px-4 py-3 text-left font-medium">Последняя попытка</th>
                  <th className="px-4 py-3 text-left font-medium">Баллы</th>
                  <th className="px-4 py-3 text-left font-medium">Порог</th>
                  <th className="px-4 py-3 text-left font-medium">Результат</th>
                  <th className="px-4 py-3 text-left font-medium">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {data.assessmentDetails.map((assessment) => (
                  <tr key={assessment.id} className="border-t border-zinc-200 align-top text-zinc-700">
                    <td className="px-4 py-4 font-medium text-zinc-950">{assessment.title}</td>
                    <td className="px-4 py-4">
                      <StatusBadge label={assessment.assessmentKindLabel} tone="neutral" />
                    </td>
                    <td className="px-4 py-4">
                      {assessment.latestAttemptAt ? (
                        <div>
                          <div>Попытка {assessment.latestAttemptNumber}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {formatDateTimeRu(assessment.latestAttemptAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400">Не отправлено</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {assessment.latestScore !== null ? (
                        <div>
                          <div>
                            {assessment.latestScore}/{assessment.latestMaxScore}
                            {assessment.latestScorePercent !== null ? ` (${assessment.latestScorePercent}%)` : ""}
                          </div>
                          {assessment.latestCorrectAnswers !== null ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              Верных ответов: {assessment.latestCorrectAnswers}/{assessment.totalQuestions}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {assessment.requiredCorrectAnswers} из {assessment.totalQuestions}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <StatusBadge
                          label={assessment.latestOutcomeLabel}
                          tone={getAssessmentOutcomeTone(assessment.latestOutcomeLabel)}
                        />
                        {assessment.reviewStatusLabel ? (
                          <StatusBadge
                            label={assessment.reviewStatusLabel}
                            tone={assessment.reviewStatusLabel === "На проверке" ? "warning" : "info"}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {assessment.reviewComment ? (
                        <p className="max-w-md whitespace-pre-wrap text-sm text-zinc-700">{assessment.reviewComment}</p>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">История попыток</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Хронология попыток ученика по тестам курса.
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
            {data.attemptHistory.length} попыток
          </span>
        </div>

        {data.attemptHistory.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-6 text-center text-sm text-zinc-600">
            Ученик еще не выполнял тесты в этом курсе.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Элемент</th>
                  <th className="px-4 py-3 text-left font-medium">Тип</th>
                  <th className="px-4 py-3 text-left font-medium">Попытка</th>
                  <th className="px-4 py-3 text-left font-medium">Баллы</th>
                  <th className="px-4 py-3 text-left font-medium">Порог</th>
                  <th className="px-4 py-3 text-left font-medium">Результат</th>
                  <th className="px-4 py-3 text-left font-medium">Комментарий</th>
                  <th className="px-4 py-3 text-left font-medium">Дата</th>
                </tr>
              </thead>
              <tbody>
                {data.attemptHistory.map((attempt) => (
                  <tr key={attempt.id} className="border-t border-zinc-200 text-zinc-700">
                    <td className="px-4 py-4 font-medium text-zinc-950">{attempt.quizTitle}</td>
                    <td className="px-4 py-4">
                      <StatusBadge label={attempt.assessmentKindLabel} tone="neutral" />
                    </td>
                    <td className="px-4 py-4">{attempt.attemptNumber}</td>
                    <td className="px-4 py-4">
                      <div>
                        <div>
                          {attempt.score}/{attempt.maxScore} ({attempt.scorePercent}%)
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Верных ответов: {attempt.correctAnswers}/{attempt.totalQuestions}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {attempt.requiredCorrectAnswers} из {attempt.totalQuestions}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <StatusBadge label={attempt.outcomeLabel} tone={getAttemptTone(attempt.outcome)} />
                        {attempt.reviewStatusLabel ? (
                          <StatusBadge
                            label={attempt.reviewStatusLabel}
                            tone={attempt.reviewStatusLabel === "На проверке" ? "warning" : "info"}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {attempt.reviewComment ? (
                        <p className="max-w-md whitespace-pre-wrap text-sm text-zinc-700">{attempt.reviewComment}</p>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-zinc-500">{formatDateTimeRu(attempt.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className={`font-semibold tracking-tight text-zinc-950 ${compact ? "text-lg" : "text-3xl"}`}>{value}</div>
      <div className="mt-1 text-sm text-zinc-500">{label}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-zinc-900">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-900">{value}</dd>
    </div>
  );
}

function CourseStatusBadge({ status }: { status: string }) {
  const isPublished = status === "PUBLISHED";
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
        isPublished ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {isPublished ? "Опубликован" : "Черновик"}
    </span>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
}) {
  const className =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "danger"
        ? "bg-rose-100 text-rose-700"
        : tone === "warning"
          ? "bg-amber-100 text-amber-700"
          : tone === "info"
            ? "bg-sky-100 text-sky-700"
            : "bg-zinc-100 text-zinc-600";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function getItemTypeLabel(type: string) {
  if (type === "PDF") return "Презентация";
  if (type === "VIDEO") return "Видео";
  if (type === "QUIZ") return "Тест";
  if (type === "SURVEY") return "Опрос";
  return type;
}

function getAttemptTone(outcome: string): "neutral" | "info" | "warning" | "success" | "danger" {
  if (outcome === "PASSED") return "success";
  if (outcome === "FAILED") return "danger";
  if (outcome === "ATTEMPTED") return "warning";
  return "info";
}

function getAssessmentOutcomeTone(label: string): "neutral" | "info" | "warning" | "success" | "danger" {
  if (label === "Сдан") return "success";
  if (label === "Не сдан") return "danger";
  if (label === "Не отправлено") return "neutral";
  return "info";
}

function getAccessSummaryValue(learner: {
  accessState: "active" | "expired";
  accessExpiresAt: Date | null;
  hasUnlimitedAccess: boolean;
}) {
  if (learner.hasUnlimitedAccess) return "Бессрочно";
  if (!learner.accessExpiresAt) return "—";
  return learner.accessState === "expired"
    ? `Истек ${formatDateTimeRu(learner.accessExpiresAt)}`
    : `До ${formatDateTimeRu(learner.accessExpiresAt)}`;
}

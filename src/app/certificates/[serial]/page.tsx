import { notFound } from "next/navigation";
import { canManageCourse } from "@/lib/access";
import { requireSession } from "@/lib/auth-guards";
import { formatCourseDuration, getCourseCategoryLabel } from "@/lib/course-metadata";
import { canAccessAllCourses, isPlatformAdminRole } from "@/lib/roles";
import { CertificatePrintButton } from "./CertificatePrintButton";
import { selectCertificateBySerial } from "./_queries/select-certificate";

type Props = { params: Promise<{ serial: string }> };

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

export default async function CertificatePage({ params }: Props) {
  const { serial } = await params;
  const session = await requireSession();
  const certificate = await selectCertificateBySerial(serial);
  if (!certificate) notFound();

  const roles = session.user.roles;
  const permissions = session.user.permissions ?? [];
  const isOwner = certificate.ownerUserId === session.user.id;
  const isStaff = isPlatformAdminRole(roles) || canAccessAllCourses(roles, permissions);
  const isCourseManager = canManageCourse(roles, session.user.id, { ownerId: certificate.courseOwnerId });
  // 404, а не 403: страница не подтверждает существование серийника постороннему.
  if (!isOwner && !isStaff && !isCourseManager) notFound();

  const { snapshot } = certificate;
  const isRevoked = certificate.status === "REVOKED";
  const score = snapshot.completion.scorePercent;
  const duration = snapshot.course.durationMinutes ? formatCourseDuration(snapshot.course.durationMinutes) : null;
  const category = snapshot.course.category ? getCourseCategoryLabel(snapshot.course.category) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div data-app-chrome className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ink)]">Сертификат</h1>
          <p className="text-sm text-[var(--ink-muted)]">№ {certificate.serial}</p>
        </div>
        <CertificatePrintButton />
      </div>

      {isRevoked ? (
        <div
          data-app-chrome
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          Этот сертификат аннулирован
          {certificate.revokedAt ? ` ${formatDate(certificate.revokedAt)}` : ""}.
          {certificate.revokeReason ? ` Причина: ${certificate.revokeReason}.` : ""}
        </div>
      ) : null}

      <article
        className="certificate-sheet rounded-2xl p-10 text-center md:p-16"
        style={{
          background: "var(--surface)",
          border: "2px solid var(--accent)",
          opacity: isRevoked ? 0.6 : 1,
        }}
      >
        <div className="flex items-center justify-center gap-3">
          {snapshot.platform.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshot.platform.logoUrl} alt="" className="h-10 w-auto" />
          ) : null}
          <span className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            {snapshot.platform.siteName}
          </span>
        </div>

        <p className="mt-8 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
          Сертификат о прохождении курса
        </p>

        <p className="mt-6 text-sm text-[var(--ink-muted)]">Настоящим подтверждается, что</p>
        <p className="mt-2 text-3xl font-semibold text-[var(--ink)] md:text-4xl">
          {snapshot.learner.fullName}
        </p>

        <p className="mt-4 text-sm text-[var(--ink-muted)]">успешно завершил(а) курс</p>
        <p className="mt-2 text-xl font-medium text-[var(--ink)] md:text-2xl">
          «{snapshot.course.title}»
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-[var(--ink-muted)]">
          <span>
            Дата завершения: <b className="text-[var(--ink)]">{formatDate(snapshot.completion.completedAt)}</b>
          </span>
          {duration ? (
            <span>
              Длительность: <b className="text-[var(--ink)]">{duration}</b>
            </span>
          ) : null}
          {category ? (
            <span>
              Категория: <b className="text-[var(--ink)]">{category}</b>
            </span>
          ) : null}
          {score != null ? (
            <span>
              Результат: <b className="text-[var(--ink)]">{score}%</b>
            </span>
          ) : null}
        </div>

        <div
          className="mt-10 flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-[var(--ink-muted)]"
          style={{ borderTop: "1px solid var(--accent-soft)" }}
        >
          <span>Серийный номер: {certificate.serial}</span>
          <span>Выдан: {formatDate(certificate.issuedAt)}</span>
        </div>
      </article>
    </div>
  );
}

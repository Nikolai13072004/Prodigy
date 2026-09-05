import type { ReactNode } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui";

import type { CourseManagementSection } from "./_queries/management-load-policy";
import type {
  CourseAttentionCard,
  CourseManagementTab,
} from "./_queries/select-course-management-view-model";

type Props = {
  courseId: string;
  returnUserId: string | null;
  activeSection: CourseManagementSection;
  tabs: CourseManagementTab[];
  attentionCards: CourseAttentionCard[];
  course: {
    title: string;
    description: string | null;
    status: string;
    itemCount: number;
    assignmentCount: number;
    feedbackCount: number;
  };
  children: ReactNode;
};

export function CourseManagementShell({
  courseId,
  returnUserId,
  activeSection,
  tabs,
  attentionCards,
  course,
  children,
}: Props) {
  return (
    <main className="w-full max-w-none py-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--accent)]">
        {returnUserId ? (
          <><Link href={`/admin/users/${returnUserId}/edit?tab=courses`} className="underline">← Назад к пользователю</Link><span>·</span></>
        ) : null}
        <Link href="/courses" className="underline">← К списку курсов</Link><span>·</span>
        <Link href={`/courses/${courseId}?view=content`} className="underline">К просмотру курса</Link><span>·</span>
        <Link href={`/courses/${courseId}?view=content&asLearner=1`} className="underline">Смотреть как ученик</Link>
      </div>

      <section className="mt-5 overflow-visible rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
        <div className="border-b border-[var(--line)] px-6 py-6">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">Курс</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="break-words text-3xl font-semibold text-[var(--ink)]">{course.title}</h1>
              <p className="max-w-3xl text-sm text-[var(--ink-muted)]">{course.description || "Описание курса пока не заполнено."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CourseStatusBadge status={course.status} />
              <HeaderPill label="Элементы" value={course.itemCount} />
              <HeaderPill label="Назначения" value={course.assignmentCount} />
              <HeaderPill label="Отзывы" value={course.feedbackCount} />
            </div>
          </div>
        </div>

        <nav className="overflow-x-auto overflow-y-hidden border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="flex min-w-max items-stretch">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={buildSectionHref(courseId, tab.key, returnUserId)}
                className={`relative border-r border-[var(--line)] px-5 py-3 text-sm transition ${activeSection === tab.key ? "bg-[var(--surface-raised)] font-semibold text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]"}`}
              >
                {tab.label}
                {activeSection === tab.key ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px h-1 bg-[var(--ink)]" /> : null}
              </Link>
            ))}
          </div>
        </nav>

        <div className="px-6 py-6">
          {attentionCards.length ? <CourseAttentionPanel cards={attentionCards} /> : null}
          {children}
        </div>
      </section>
    </main>
  );
}

function buildSectionHref(courseId: string, section: CourseManagementSection, returnUserId: string | null) {
  const params = new URLSearchParams({ section });
  if (returnUserId) params.set("fromUser", returnUserId);
  return `/courses/${courseId}/manage?${params.toString()}`;
}

function HeaderPill({ label, value }: { label: string; value: number }) {
  return (
    <Badge tone="neutral">
      <span className="text-[var(--ink-muted)]">{label}: </span>
      <span className="font-medium text-[var(--ink)]">{value}</span>
    </Badge>
  );
}

function CourseStatusBadge({ status }: { status: string }) {
  const published = status === "PUBLISHED";
  const archived = status === "ARCHIVED";
  const label = published ? "Опубликован" : archived ? "Архив" : "Черновик";
  return <Badge tone={published ? "success" : archived ? "neutral" : "warning"}>{label}</Badge>;
}

function CourseAttentionPanel({ cards }: { cards: CourseAttentionCard[] }) {
  return (
    <section className="mb-6 rounded-2xl border border-[var(--warning-soft)] bg-[var(--warning-soft)] p-4">
      <h2 className="text-sm font-semibold text-[var(--warning)]">Требует внимания</h2>
      <p className="mt-1 text-xs text-[var(--warning)]">Быстрый список действий по этому курсу.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className="rounded-xl border border-[var(--warning-soft)] bg-[var(--surface-raised)] p-4 transition hover:border-[var(--warning)] hover:bg-[var(--warning-soft)]">
            <span className="text-2xl font-semibold text-[var(--warning)]">{card.value}</span>
            <span className="mt-1 block text-sm font-semibold text-[var(--ink)]">{card.title}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">{card.description}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

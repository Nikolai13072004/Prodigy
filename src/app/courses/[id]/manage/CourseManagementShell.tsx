import type { ReactNode } from "react";
import Link from "next/link";

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
      <div className="flex flex-wrap items-center gap-3 text-sm text-teal-700">
        {returnUserId ? (
          <><Link href={`/admin/users/${returnUserId}/edit?tab=courses`} className="underline">← Назад к пользователю</Link><span>·</span></>
        ) : null}
        <Link href="/courses" className="underline">← К списку курсов</Link><span>·</span>
        <Link href={`/courses/${courseId}?view=content`} className="underline">К просмотру курса</Link><span>·</span>
        <Link href={`/courses/${courseId}?view=content&asLearner=1`} className="underline">Смотреть как ученик</Link>
      </div>

      <section className="mt-5 overflow-visible rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-6">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Курс</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="break-words text-3xl font-semibold text-zinc-950">{course.title}</h1>
              <p className="max-w-3xl text-sm text-zinc-600">{course.description || "Описание курса пока не заполнено."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CourseStatusBadge status={course.status} />
              <HeaderPill label="Элементы" value={course.itemCount} />
              <HeaderPill label="Назначения" value={course.assignmentCount} />
              <HeaderPill label="Отзывы" value={course.feedbackCount} />
            </div>
          </div>
        </div>

        <nav className="overflow-x-auto overflow-y-hidden border-b border-zinc-200 bg-zinc-50/80">
          <div className="flex min-w-max items-stretch">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={buildSectionHref(courseId, tab.key, returnUserId)}
                className={`relative border-r border-zinc-200 px-5 py-3 text-sm transition ${activeSection === tab.key ? "bg-white font-semibold text-[#0b2446]" : "text-zinc-500 hover:bg-white hover:text-zinc-800"}`}
              >
                {tab.label}
                {activeSection === tab.key ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px h-1 bg-[#0b2446]" /> : null}
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
  return <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"><span className="text-zinc-500">{label}: </span><span className="font-medium text-zinc-900">{value}</span></div>;
}

function CourseStatusBadge({ status }: { status: string }) {
  const published = status === "PUBLISHED";
  const archived = status === "ARCHIVED";
  const label = published ? "Опубликован" : archived ? "Архив" : "Черновик";
  const classes = published ? "border-emerald-200 bg-emerald-50 text-emerald-700" : archived ? "border-zinc-300 bg-zinc-100 text-zinc-700" : "border-amber-200 bg-amber-50 text-amber-700";
  return <div className={`inline-flex items-center rounded-full border px-3 py-2 text-sm ${classes}`}><span className="font-medium">{label}</span></div>;
}

function CourseAttentionPanel({ cards }: { cards: CourseAttentionCard[] }) {
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <h2 className="text-sm font-semibold text-amber-950">Требует внимания</h2>
      <p className="mt-1 text-xs text-amber-800">Быстрый список действий по этому курсу.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className="rounded-xl border border-amber-200 bg-white p-4 transition hover:border-amber-300 hover:bg-amber-50">
            <span className="text-2xl font-semibold text-amber-950">{card.value}</span>
            <span className="mt-1 block text-sm font-semibold text-zinc-950">{card.title}</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-600">{card.description}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

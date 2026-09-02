import Link from "next/link";
import type React from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui";
import prisma from "@/lib/prisma";
import { formatDateRu, formatDateTimeRu } from "./_home-parts";

// Обзор платформы для администратора (админ-дашборд главной).
// Вынесено из page.tsx (ADR-013 IA-B).
export async function AdminHomeDashboard() {
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const [courses, usersCount, groupsCount, monthLoginsCount, latestMaterials, recentLoginEvents, feedbackCount] = await Promise.all([
    prisma.course.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    }),
    prisma.user.count(),
    prisma.group.count(),
    prisma.loginEvent.count({
      where: { createdAt: { gte: monthAgo } },
    }),
    prisma.courseItem.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        course: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.loginEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
      },
    }),
    prisma.courseFeedback.count({
      where: { status: "PUBLISHED" },
    }),
  ]);

  const materialsCount = courses.reduce((sum, course) => sum + course._count.items, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Обзор платформы</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Ключевые метрики и последние события.</p>
      </header>

      <section className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <MetricCard icon="materials" label="материалов" value={String(materialsCount)} />
        <MetricCard icon="users" label="пользователей" value={String(usersCount)} />
        <MetricCard icon="groups" label="групп" value={String(groupsCount)} />
        <MetricCard icon="logins" label="входов за 1 месяц" value={String(monthLoginsCount)} />
        <MetricCard icon="courses" label="курсов" value={String(courses.length)} />
        <MetricCard icon="feedback" label="отзывов" value={String(feedbackCount)} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <PanelCard title="Новый материал" subtitle="Добавленный автором за неделю">
          {latestMaterials.length === 0 ? (
            <EmptyState message="Материалы пока не добавлены." />
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)] text-sm">
              {latestMaterials.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/courses/${item.course.id}`}
                    className="truncate text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="shrink-0 text-xs text-[var(--ink-muted)]">{formatDateRu(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        <PanelCard title="История входов" subtitle="Последние входы пользователей">
          {recentLoginEvents.length === 0 ? (
            <EmptyState message="Пока нет событий входа." />
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)] text-sm">
              {recentLoginEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate text-[var(--ink)]">
                    {event.user.name} <span className="text-[var(--ink-muted)]">({event.user.login})</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--ink-muted)]">{formatDateTimeRu(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </section>
    </div>
  );
}

type MetricIconKind = "materials" | "users" | "groups" | "logins" | "courses" | "feedback";

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: MetricIconKind;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <MetricIcon kind={icon} />
        </div>
        <div>
          <div className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
          <div className="mt-0.5 text-xs text-[var(--ink-muted)]">{label}</div>
        </div>
      </div>
    </Card>
  );
}

function PanelCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-h-[320px]">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{subtitle}</CardDescription>
      {children}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-muted)]">
      {message}
    </p>
  );
}

function MetricIcon({ kind }: { kind: MetricIconKind }) {
  switch (kind) {
    case "materials":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 4.5h8l3 3V19.5H7z" />
          <path d="M15 4.5v3h3" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "groups":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8" cy="9" r="2.5" />
          <circle cx="16" cy="9" r="2.5" />
          <path d="M3.5 18a4.5 4.5 0 0 1 9 0" />
          <path d="M11.5 18a4.5 4.5 0 0 1 9 0" />
        </svg>
      );
    case "logins":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10 7V5a4 4 0 1 1 8 0v14a4 4 0 1 1-8 0v-2" />
          <path d="M15 12H3" />
          <path d="m7 8-4 4 4 4" />
        </svg>
      );
    case "courses":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 6h8a3 3 0 0 1 3 3v9H7a3 3 0 0 0-3 3z" />
          <path d="M20 6h-8a3 3 0 0 0-3 3v9h8a3 3 0 0 1 3 3z" />
        </svg>
      );
    case "feedback":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 5h16v10H8l-4 4z" />
        </svg>
      );
  }
}

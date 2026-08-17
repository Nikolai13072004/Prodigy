import type { ReactNode } from "react";
import Link from "next/link";
import { CoursePortalTabs, type CoursePortalTab } from "@/components/CoursePortalTabs";
import type { CourseReturnSource } from "@/lib/course-return-source";

type CoursePortalBadgeTone = "default" | "success" | "warning" | "danger" | "info";

type CoursePortalBadge = {
  label: string;
  tone?: CoursePortalBadgeTone;
};

type CoursePortalStat = {
  label: string;
  value: string;
  progressPercent?: number;
};

type Props = {
  courseId: string;
  active: CoursePortalTab;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  backHref: string;
  backLabel: string;
  badges?: CoursePortalBadge[];
  stats?: CoursePortalStat[];
  actions?: ReactNode;
  heroExtra?: ReactNode;
  contentHref?: string;
  contentDisabled?: boolean;
  returnSource?: CourseReturnSource | null;
  showFeedback?: boolean;
  feedbackCount?: number;
  showSurvey?: boolean;
  hideHero?: boolean;
  children: ReactNode;
};

export function CoursePortalFrame({
  courseId,
  active,
  title,
  description,
  coverUrl,
  backHref,
  backLabel,
  badges = [],
  stats = [],
  actions,
  heroExtra,
  contentHref,
  contentDisabled = false,
  returnSource = null,
  showFeedback = true,
  feedbackCount = 0,
  showSurvey = false,
  hideHero = false,
  children,
}: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {!hideHero ? (
        <div
          className="relative overflow-hidden bg-zinc-900 px-5 py-6 text-white sm:px-7"
          style={
            coverUrl
              ? {
                  backgroundImage: `linear-gradient(105deg, rgba(9, 30, 58, 0.94) 0%, rgba(9, 30, 58, 0.78) 52%, rgba(9, 30, 58, 0.38) 100%), url("${coverUrl}")`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                }
              : undefined
          }
        >
          {!coverUrl ? (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#0c2a52_0%,#007fa8_100%)]" />
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.14),transparent_34%)]" />

          <div
            className={`relative grid gap-5 lg:items-end ${
              stats.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_300px]" : "lg:grid-cols-1"
            }`}
          >
            <div className="min-w-0">
              <Link href={backHref} className="inline-flex text-sm font-medium text-white/75 hover:text-white">
                ← {backLabel}
              </Link>

              {badges.length > 0 ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {badges.map((badge) => (
                    <span
                      key={`${badge.label}-${badge.tone ?? "default"}`}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${getBadgeToneClass(badge.tone)}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              ) : null}

              <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
              {description ? (
                <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-white/80">{description}</p>
              ) : null}

              {heroExtra ? <div className="mt-5 max-w-3xl">{heroExtra}</div> : null}
              {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
            </div>

            {stats.length > 0 ? (
              <div className="rounded-xl border border-white/20 bg-white/12 p-4 text-white shadow-lg backdrop-blur">
                <div className="grid gap-3">
                  {stats.map((stat) => (
                    <div key={stat.label}>
                      <div className="flex items-center justify-between gap-3 text-xs text-white/75">
                        <span>{stat.label}</span>
                        <span className="font-semibold text-white">{stat.value}</span>
                      </div>
                      {typeof stat.progressPercent === "number" ? (
                        <div className="mt-2 h-1.5 rounded-full bg-white/25">
                          <div
                            className="h-1.5 rounded-full bg-white transition-all"
                            style={{ width: `${Math.max(0, Math.min(stat.progressPercent, 100))}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <CoursePortalTabs
        courseId={courseId}
        active={active}
        contentHref={contentHref}
        contentDisabled={contentDisabled}
        returnSource={returnSource}
        showFeedback={showFeedback}
        feedbackCount={feedbackCount}
        showSurvey={showSurvey}
      />

      <div className="border-t border-zinc-200 bg-slate-50/70 px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function getBadgeToneClass(tone: CoursePortalBadgeTone = "default") {
  if (tone === "success") return "bg-emerald-100 text-emerald-700";
  if (tone === "warning") return "bg-amber-100 text-amber-800";
  if (tone === "danger") return "bg-red-100 text-red-700";
  if (tone === "info") return "bg-sky-100 text-sky-700";
  return "bg-white/15 text-white/85";
}

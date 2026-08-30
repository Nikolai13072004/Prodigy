import Link from "next/link";
import { requirePermission } from "@/lib/auth-guards";
import { getPlatformAttentionOverview, type PlatformAttentionCard } from "@/lib/platform-attention";
import { PERMISSIONS } from "@/lib/roles";
import { AnalyticsSubtabs } from "@/components/AnalyticsSubtabs";
import { Badge, buttonStyles, type BadgeTone } from "@/components/ui";

export default async function AdminAttentionPage() {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const overview = await getPlatformAttentionOverview();

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Центр внимания</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
            Сигналы, которые требуют действия администратора или HR: ручные проверки, отзывы, ошибки писем и дедлайны доступа.
          </p>
        </div>
        <Link href="/admin/reports/problems" className={buttonStyles("secondary")}>
          Открыть проблемный отчет
        </Link>
      </div>

      <AnalyticsSubtabs active="attention" />

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overview.cards.map((card) => (
          <AttentionCard key={card.key} card={card} />
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Последние события</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Список отсортирован по дате события или ближайшему дедлайну.</p>
          </div>
          <Badge tone="neutral">{overview.items.length} в ленте</Badge>
        </div>

        {overview.items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
            Сейчас нет событий, которые требуют внимания.
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
            {overview.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={item.href} className="block px-4 py-4 transition hover:bg-[var(--accent-soft)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--ink)]">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-muted)]">{item.meta}</p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--ink-muted)]">{item.createdAt.toLocaleString("ru-RU")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function attentionBadgeTone(tone: PlatformAttentionCard["tone"]): BadgeTone {
  if (tone === "rose") return "danger";
  if (tone === "amber") return "warning";
  if (tone === "sky") return "info";
  return "success";
}

function AttentionCard({ card }: { card: PlatformAttentionCard }) {
  return (
    <Link
      href={card.href}
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm hover:bg-[var(--accent-soft)]"
    >
      <Badge tone={attentionBadgeTone(card.tone)}>{card.label}</Badge>
      <div className="mt-4 text-4xl font-semibold tracking-tight text-[var(--ink)]">{card.value}</div>
    </Link>
  );
}

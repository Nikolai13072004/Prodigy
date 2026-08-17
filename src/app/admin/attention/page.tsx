import Link from "next/link";
import { requirePermission } from "@/lib/auth-guards";
import { getPlatformAttentionOverview, type PlatformAttentionCard } from "@/lib/platform-attention";
import { PERMISSIONS } from "@/lib/roles";

export default async function AdminAttentionPage() {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const overview = await getPlatformAttentionOverview();

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Центр внимания</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Сигналы, которые требуют действия администратора или HR: ручные проверки, отзывы, ошибки писем и дедлайны доступа.
          </p>
        </div>
        <Link
          href="/admin/reports/problems"
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Открыть проблемный отчет
        </Link>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overview.cards.map((card) => (
          <AttentionCard key={card.key} card={card} />
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Последние события</h2>
            <p className="mt-1 text-sm text-zinc-600">Список отсортирован по дате события или ближайшему дедлайну.</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
            {overview.items.length} в ленте
          </span>
        </div>

        {overview.items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center text-sm text-zinc-700">
            Сейчас нет событий, которые требуют внимания.
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200">
            {overview.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={item.href} className="block px-4 py-4 transition hover:bg-zinc-50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-950">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{item.meta}</p>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">{item.createdAt.toLocaleString("ru-RU")}</span>
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

function AttentionCard({ card }: { card: PlatformAttentionCard }) {
  const toneClass =
    card.tone === "rose"
      ? "bg-rose-50 text-rose-700"
      : card.tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : card.tone === "sky"
          ? "bg-sky-50 text-sky-700"
          : "bg-emerald-50 text-emerald-700";

  return (
    <Link href={card.href} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:bg-zinc-50">
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${toneClass}`}>{card.label}</div>
      <div className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950">{card.value}</div>
    </Link>
  );
}

"use client";

import { useState } from "react";

type Props = {
  defaultRating: number | null;
  defaultComment: string;
};

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;
const RATING_LABELS: Record<number, string> = {
  1: "Плохо",
  2: "Слабо",
  3: "Нормально",
  4: "Хорошо",
  5: "Отлично",
};

export function CourseFeedbackComposer({ defaultRating, defaultComment }: Props) {
  const [rating, setRating] = useState<number | null>(defaultRating);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const activeRating = hoverRating ?? rating;

  return (
    <>
      <fieldset>
        <legend className="sr-only">Оценка курса</legend>
        <input type="hidden" name="rating" value={rating ?? ""} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Как вы оцениваете этот курс?</span>
          <div className="flex items-center gap-0.5" onMouseLeave={() => setHoverRating(null)}>
            {RATING_OPTIONS.map((value) => {
              const isActive = activeRating !== null && value <= activeRating;
              const showTooltip = hoverRating === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={rating === value}
                  aria-label={`${formatRatingValue(value)} - ${RATING_LABELS[value]}`}
                  onMouseEnter={() => setHoverRating(value)}
                  onFocus={() => setHoverRating(value)}
                  onBlur={() => setHoverRating(null)}
                  onClick={() => setRating(value)}
                  className={`relative rounded-md px-1 py-0.5 text-xl leading-none transition focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                    isActive ? "text-amber-500" : "text-zinc-300 hover:text-amber-400"
                  }`}
                >
                  {showTooltip ? (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-xs font-medium leading-none text-white shadow-lg">
                      {formatRatingTooltip(value)}
                      <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-zinc-900" />
                    </span>
                  ) : null}
                  ★
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <div className="mt-2 flex items-end gap-2">
        <textarea
          id="comment"
          name="comment"
          aria-label="Комментарий"
          rows={3}
          defaultValue={defaultComment}
          placeholder="Расскажите подробно о ваших впечатлениях о курсе..."
          className="min-h-20 flex-1 resize-y border-0 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          title={rating ? "Отправить" : "Сначала выберите оценку"}
          aria-label="Отправить отзыв"
          disabled={!rating}
          className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-lg font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          ›
        </button>
      </div>
    </>
  );
}

function formatRatingValue(value: number) {
  if (value === 1) return "1 звезда";
  if (value >= 2 && value <= 4) return `${value} звезды`;
  return `${value} звезд`;
}

function formatRatingTooltip(value: number) {
  return RATING_LABELS[value];
}

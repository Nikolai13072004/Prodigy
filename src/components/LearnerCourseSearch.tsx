"use client";

import { FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type LearnerCourseSearchProps = {
  value: string;
  tab: "assigned" | "completed";
  forceLearnerMode?: boolean;
};

export function LearnerCourseSearch({
  value: initialValue,
  tab,
  forceLearnerMode = false,
}: LearnerCourseSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const replaceSearch = useCallback(
    (nextValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmedValue = nextValue.trim();

      if (tab === "assigned" && !forceLearnerMode) {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }

      if (trimmedValue) {
        params.set("q", trimmedValue);
      } else {
        params.delete("q");
      }

      const query = params.toString();
      const nextHref = query ? `${pathname}?${query}` : pathname;
      const currentQuery = searchParams.toString();
      const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;

      if (nextHref === currentHref) return;

      startTransition(() => {
        router.replace(nextHref, { scroll: false });
      });
    },
    [forceLearnerMode, pathname, router, searchParams, tab]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      replaceSearch(value);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [replaceSearch, value]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    replaceSearch(value);
  }

  return (
    <form onSubmit={handleSubmit} action="/courses" className="relative w-full sm:w-80" aria-busy={isPending}>
      <label className="sr-only" htmlFor="learner-course-search">
        Поиск курса
      </label>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
          <path
            d="m14.5 14.5 3 3m-1.25-8.125a6.875 6.875 0 1 1-13.75 0 6.875 6.875 0 0 1 13.75 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <input
        id="learner-course-search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Поиск по моим курсам"
        autoComplete="off"
        className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-10 text-sm outline-none ring-teal-500 transition focus:border-teal-400 focus:ring-2"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            replaceSearch("");
          }}
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Очистить поиск"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
            <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </form>
  );
}

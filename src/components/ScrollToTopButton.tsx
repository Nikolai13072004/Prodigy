"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const SCROLL_OFFSET = 240;

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      const root = document.documentElement;
      const canScroll = root.scrollHeight > window.innerHeight + 8;
      setVisible(canScroll && window.scrollY > SCROLL_OFFSET);
    };

    updateVisibility();

    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    const resizeObserver = new ResizeObserver(updateVisibility);
    resizeObserver.observe(document.body);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <button
      type="button"
      aria-label="Наверх"
      title="Наверх"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-700 text-white shadow-lg shadow-slate-900/15 ring-1 ring-sky-900/10 transition duration-200 hover:bg-sky-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 md:bottom-6 md:right-6 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUp className="h-6 w-6" aria-hidden="true" strokeWidth={2.4} />
    </button>
  );
}

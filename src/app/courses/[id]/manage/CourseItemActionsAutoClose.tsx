"use client";

import { useEffect } from "react";

export function CourseItemActionsAutoClose() {
  useEffect(() => {
    function closeMenus(except?: HTMLDetailsElement | null) {
      document.querySelectorAll<HTMLDetailsElement>("details[data-course-item-actions][open]").forEach((details) => {
        if (details !== except) details.open = false;
      });
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const currentMenu = target.closest<HTMLDetailsElement>("details[data-course-item-actions]");
      closeMenus(currentMenu);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}

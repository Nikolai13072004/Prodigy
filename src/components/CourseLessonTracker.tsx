"use client";

import { useEffect, useRef } from "react";

type Props = {
  courseId: string;
  courseItemId: string;
  enabled?: boolean;
};

export function CourseLessonTracker({ courseId, courseItemId, enabled = true }: Props) {
  const lastTrackedRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;

    const signature = `${courseId}:${courseItemId}`;
    if (!courseId || !courseItemId || lastTrackedRef.current === signature) return;
    lastTrackedRef.current = signature;

    const controller = new AbortController();
    void fetch("/api/course-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, courseItemId }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => undefined);

    return () => controller.abort();
  }, [courseId, courseItemId, enabled]);

  return null;
}

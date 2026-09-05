"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { CourseItem } from "@prisma/client";
import { COURSE_ITEM_LABELS, normalizePresentationViewMode } from "@/lib/constants";
import type { CourseItemType, PresentationViewMode } from "@/lib/constants";
import { sanitizeRichTextHtml } from "@/lib/rich-text";
import { PERMISSIONS, canTrackMaterialProgress, hasPermission, type RoleLike } from "@/lib/roles";
import type {
  MaterialLearningEvent,
  MaterialLearningStateDto,
} from "@/modules/learning/domain/material-learning";

type ViewState = {
  progressPercent: number;
  maxPageSeen: number;
  totalPages: number | null;
} | null;

type PdfPageLink = {
  href: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type PdfPageSize = {
  width: number;
  height: number;
};

type PositionedPdfPageLink = PdfPageLink & {
  hitLeft: number;
  hitTop: number;
  hitWidth: number;
  hitHeight: number;
};

type PptxHtml5ProgressMessage = {
  source: "lms-pptx-html5";
  type: "progress";
  currentSlide: number;
  totalSlides: number;
  completed?: boolean;
};

type Props = {
  courseTitle: string;
  role: RoleLike;
  permissions?: string[] | null;
  item: Pick<
    CourseItem,
    "id" | "type" | "title" | "content" | "fileUrl" | "isRequired" | "totalSlides" | "presentationViewMode"
  >;
  initialView: ViewState;
  autoOpen?: boolean;
  closeHref?: string;
  completionHref?: string;
  completionType?: string;
  completionTitle?: string;
  courseCompletionHref?: string;
  canSwitchPresentationPreview?: boolean;
  canTrackProgressOverride?: boolean;
};

function isYouTubeUrl(url: string) {
  return /youtube\.com\/watch|youtu\.be\//i.test(url);
}

function isPptxUrl(url: string) {
  return /\.pptx(\?|#|$)/i.test(url);
}

function toPptxPreviewPdfUrl(urlValue: string) {
  return urlValue.replace(/\.pptx(\?|#|$)/i, ".pdf$1");
}

function toPptxHtml5Url(urlValue: string) {
  const cleanPath = urlValue.split("?")[0].split("#")[0];
  if (!cleanPath.startsWith("/uploads/") || !/\.pptx$/i.test(cleanPath)) return null;
  const fileName = cleanPath.split("/").pop();
  if (!fileName) return null;
  const baseName = fileName.replace(/\.pptx$/i, "");
  return `/uploads/pptx-html5/${encodeURIComponent(baseName)}/index.html`;
}

function toPdfPageImageUrl(urlValue: string, page: number) {
  const search = new URLSearchParams({
    url: urlValue,
    page: String(page),
  });
  return `/api/pdf-page-image?${search.toString()}`;
}

function toPdfPageLinksUrl(urlValue: string, page: number) {
  const search = new URLSearchParams({
    url: urlValue,
    page: String(page),
  });
  return `/api/pdf-page-links?${search.toString()}`;
}

function isEndShowLink(href: string) {
  return href.toLowerCase().includes("jump=endshow");
}

function toYouTubeEmbed(urlValue: string) {
  try {
    const url = new URL(urlValue, "https://example.com");
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const videoId = url.searchParams.get("v");
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isPptxHtml5ProgressMessage(data: unknown): data is PptxHtml5ProgressMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as Partial<PptxHtml5ProgressMessage>;
  return (
    message.source === "lms-pptx-html5" &&
    message.type === "progress" &&
    typeof message.currentSlide === "number" &&
    typeof message.totalSlides === "number"
  );
}

async function persistMaterialProgress(input: {
  courseItemId: string;
  event: MaterialLearningEvent;
}) {
  const response = await fetch("/api/material-progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Не удалось сохранить прогресс материала");
  }
  return (await response.json()) as MaterialLearningStateDto & { ok: true };
}

export function MaterialView({
  courseTitle,
  role,
  permissions,
  item,
  initialView,
  autoOpen = false,
  closeHref,
  completionHref,
  completionType,
  completionTitle,
  courseCompletionHref,
  canSwitchPresentationPreview: canSwitchPresentationPreviewOverride,
  canTrackProgressOverride,
}: Props) {
  const router = useRouter();
  const type = item.type as CourseItemType;
  const label = COURSE_ITEM_LABELS[type] ?? item.type;
  const canTrackProgress =
    canTrackProgressOverride ?? canTrackMaterialProgress(role, permissions);
  const canSwitchPresentationPreview =
    canSwitchPresentationPreviewOverride ??
    (hasPermission(role, PERMISSIONS.COURSES_CREATE_EDIT, permissions) ||
      hasPermission(role, PERMISSIONS.COURSES_PUBLISH, permissions));

  const declaredTotalSlides = Math.max(item.totalSlides ?? 1, 1);
  const persistedTotalSlides =
    initialView?.totalPages && initialView.totalPages > 0 ? initialView.totalPages : null;
  const totalSlides = Math.max(persistedTotalSlides ?? declaredTotalSlides, 1);
  const isPptxMaterial = type === "PDF" && Boolean(item.fileUrl && isPptxUrl(item.fileUrl));
  const presentationViewMode: PresentationViewMode = normalizePresentationViewMode(item.presentationViewMode);
  const wantsHtml5Pptx = isPptxMaterial && presentationViewMode === "PPTX_HTML5";
  const pptxPreviewPdfUrl =
    isPptxMaterial && item.fileUrl ? toPptxPreviewPdfUrl(item.fileUrl) : null;
  const pptxHtml5Url = isPptxMaterial && item.fileUrl ? toPptxHtml5Url(item.fileUrl) : null;
  const richTextContent = useMemo(() => sanitizeRichTextHtml(item.content), [item.content]);

  const initialSlide = clamp(initialView?.maxPageSeen ?? 1, 1, totalSlides);
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  const [lastSeenSlide, setLastSeenSlide] = useState(initialSlide);
  const [savedProgressPercent, setSavedProgressPercent] = useState(
    clamp(initialView?.progressPercent ?? 0, 0, 100)
  );
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(autoOpen && type === "PDF");
  const [isVideoOpen, setIsVideoOpen] = useState(autoOpen && type === "VIDEO");
  const [isCompletionPromptOpen, setIsCompletionPromptOpen] = useState(false);
  const [isFollowingCompletionLink, setIsFollowingCompletionLink] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [forcePdfFallback, setForcePdfFallback] = useState(false);
  const [presentationOpenInitialSlide, setPresentationOpenInitialSlide] = useState(initialSlide);
  const [pptxPreviewReady, setPptxPreviewReady] = useState<boolean | null>(null);
  const [pptxHtml5Ready, setPptxHtml5Ready] = useState<boolean | null>(null);
  const [presentationLinks, setPresentationLinks] = useState<PdfPageLink[]>([]);
  const [presentationPageSize, setPresentationPageSize] = useState<PdfPageSize | null>(null);
  const [presentationFrameSize, setPresentationFrameSize] = useState<PdfPageSize | null>(null);
  const [resolvedPresentationPages, setResolvedPresentationPages] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const presentationFrameRef = useRef<HTMLDivElement>(null);
  const videoModalRef = useRef<HTMLDivElement>(null);
  const previousBodyOverflowRef = useRef<string | null>(null);
  const savedProgressRef = useRef({
    progressPercent: clamp(initialView?.progressPercent ?? 0, 0, 100),
    maxPageSeen: initialView?.maxPageSeen ?? 0,
    totalPages: initialView?.totalPages ?? null,
  });
  const effectiveTotalSlides = resolvedPresentationPages ?? totalSlides;
  const progressPercent = clamp(savedProgressPercent, 0, 100);

  const useHtml5Pptx = wantsHtml5Pptx && !forcePdfFallback && pptxHtml5Ready !== false;
  const isPdfSlideMode =
    type === "PDF" &&
    !useHtml5Pptx &&
    (!isPptxMaterial || (isPptxMaterial && pptxPreviewReady === true));
  const presentationPdfUrl =
    type !== "PDF" || useHtml5Pptx
      ? null
      : isPptxMaterial
        ? pptxPreviewReady
          ? pptxPreviewPdfUrl
          : null
        : item.fileUrl;
  const presentationSlideImageUrl =
    presentationPdfUrl && presentationPdfUrl.startsWith("/uploads/")
      ? toPdfPageImageUrl(presentationPdfUrl, currentSlide)
      : null;
  const presentationPages = effectiveTotalSlides;
  const hasKnownPresentationPages = resolvedPresentationPages !== null || totalSlides > 1;
  const isFinalPresentationSlide =
    (isPdfSlideMode || useHtml5Pptx) && hasKnownPresentationPages && currentSlide >= presentationPages;
  const hasNextQuizAfterPresentation = completionType === "QUIZ" && Boolean(completionHref);
  const goToPrevSlide = () => setCurrentSlide((prev) => Math.max(prev - 1, 1));
  const goToNextSlide = () =>
    setCurrentSlide((prev) =>
      hasKnownPresentationPages ? clamp(prev + 1, 1, presentationPages) : prev + 1
    );
  const positionedPresentationLinks = useMemo<PositionedPdfPageLink[]>(() => {
    if (!presentationFrameSize || presentationFrameSize.width <= 0 || presentationFrameSize.height <= 0) {
      return [];
    }

    const pageWidth = presentationPageSize?.width ?? 16;
    const pageHeight = presentationPageSize?.height ?? 9;
    const pageAspect = pageWidth / pageHeight;
    const frameAspect = presentationFrameSize.width / presentationFrameSize.height;
    const renderedWidth = frameAspect > pageAspect
      ? presentationFrameSize.height * pageAspect
      : presentationFrameSize.width;
    const renderedHeight = frameAspect > pageAspect
      ? presentationFrameSize.height
      : presentationFrameSize.width / pageAspect;
    const renderedLeft = (presentationFrameSize.width - renderedWidth) / 2;
    const renderedTop = (presentationFrameSize.height - renderedHeight) / 2;

    return presentationLinks.map((link) => {
      const linkLeft = renderedLeft + (link.left / 100) * renderedWidth;
      const linkTop = renderedTop + (link.top / 100) * renderedHeight;
      const linkWidth = (link.width / 100) * renderedWidth;
      const linkHeight = (link.height / 100) * renderedHeight;
      const centerX = linkLeft + linkWidth / 2;
      const centerY = linkTop + linkHeight / 2;
      const isCompletionLink = isEndShowLink(link.href);
      const hitWidth = Math.max(linkWidth + (isCompletionLink ? 160 : 18), isCompletionLink ? 280 : 48);
      const hitHeight = Math.max(linkHeight + (isCompletionLink ? 110 : 14), isCompletionLink ? 170 : 36);
      const minLeft = renderedLeft;
      const minTop = renderedTop;
      const maxLeft = Math.max(minLeft, renderedLeft + renderedWidth - hitWidth);
      const maxTop = Math.max(minTop, renderedTop + renderedHeight - hitHeight);

      return {
        ...link,
        hitLeft: clamp(centerX - hitWidth / 2, minLeft, maxLeft),
        hitTop: clamp(centerY - hitHeight / 2, minTop, maxTop),
        hitWidth,
        hitHeight,
      };
    });
  }, [presentationFrameSize, presentationLinks, presentationPageSize]);

  useEffect(() => {
    if (type !== "PDF") return;
    setLastSeenSlide((prev) => Math.max(prev, currentSlide));
  }, [currentSlide, type]);

  const syncSavedProgress = useCallback(
    (result: {
      progressPercent: number;
      maxPageSeen: number;
      totalPages: number;
    }, options: { refresh?: boolean } = {}) => {
      const previous = savedProgressRef.current;
      const hasChanged =
        result.progressPercent !== previous.progressPercent ||
        result.maxPageSeen !== previous.maxPageSeen ||
        result.totalPages !== previous.totalPages;

      savedProgressRef.current = {
        progressPercent: result.progressPercent,
        maxPageSeen: result.maxPageSeen,
        totalPages: result.totalPages,
      };
      setSavedProgressPercent(result.progressPercent);
      setLastSeenSlide(result.maxPageSeen);

      if (hasChanged && options.refresh !== false) {
        router.refresh();
      }
    },
    [router]
  );

  useEffect(() => {
    if (!isPresentationOpen || !useHtml5Pptx) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isPptxHtml5ProgressMessage(event.data)) return;

      const totalPagesFromPlayer = Math.max(Math.floor(event.data.totalSlides), 1);
      const pageFromPlayer = clamp(Math.floor(event.data.currentSlide), 1, totalPagesFromPlayer);
      setResolvedPresentationPages(totalPagesFromPlayer);
      setCurrentSlide(pageFromPlayer);

      if (!canTrackProgress) return;
      void (async () => {
        try {
          const result = await persistMaterialProgress({
            courseItemId: item.id,
            event: { type: "PRESENTATION_PAGE_VIEWED", page: pageFromPlayer },
          });
          syncSavedProgress(result);
        } catch {
          // no-op for MVP
        }
      })();
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [canTrackProgress, isPresentationOpen, item.id, syncSavedProgress, useHtml5Pptx]);

  const sectionProgressText = useMemo(() => {
    if (type === "PDF") {
      if (progressPercent >= 100) return "Завершен";
      if (progressPercent > 0) return "В процессе";
      return "Не начато";
    }
    if (progressPercent >= 100) return "Завершен";
    if (progressPercent > 0) return "В процессе";
    return "Не начато";
  }, [progressPercent, type]);

  useEffect(() => {
    if (!canTrackProgress || type !== "PDF") return;
    void (async () => {
      try {
        const result = await persistMaterialProgress({
          courseItemId: item.id,
          event: { type: "PRESENTATION_PAGE_VIEWED", page: currentSlide },
        });
        syncSavedProgress(result);
      } catch {
        // no-op for MVP
      }
    })();
  }, [canTrackProgress, currentSlide, effectiveTotalSlides, item.id, syncSavedProgress, type]);

  useEffect(() => {
    if (useHtml5Pptx) return;
    if (!isPptxMaterial || !isPresentationOpen || !pptxPreviewPdfUrl) return;
    let isActive = true;
    setPptxPreviewReady(null);

    void (async () => {
      try {
        const response = await fetch(pptxPreviewPdfUrl, { method: "HEAD" });
        if (isActive) setPptxPreviewReady(response.ok);
      } catch {
        if (isActive) setPptxPreviewReady(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [isPptxMaterial, isPresentationOpen, pptxPreviewPdfUrl, useHtml5Pptx]);

  useEffect(() => {
    if (!wantsHtml5Pptx || !isPresentationOpen || !pptxHtml5Url || forcePdfFallback) return;
    let isActive = true;
    setPptxHtml5Ready(null);

    void (async () => {
      try {
        const response = await fetch(pptxHtml5Url, { method: "HEAD" });
        if (isActive) setPptxHtml5Ready(response.ok);
      } catch {
        if (isActive) setPptxHtml5Ready(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [forcePdfFallback, isPresentationOpen, pptxHtml5Url, wantsHtml5Pptx]);

  useEffect(() => {
    if (!isPresentationOpen || !presentationPdfUrl) return;
    if (!presentationPdfUrl.startsWith("/uploads/")) return;
    let isActive = true;

    void (async () => {
      try {
        const response = await fetch(
          `/api/pdf-pages?url=${encodeURIComponent(presentationPdfUrl)}`,
          { method: "GET" }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { pages?: number };
        if (!isActive) return;
        const pages = Number(payload.pages ?? 0);
        if (Number.isFinite(pages) && pages >= 1) {
          setResolvedPresentationPages(pages);
        }
      } catch {
        // no-op: keep fallback totalSlides
      }
    })();

    return () => {
      isActive = false;
    };
  }, [isPresentationOpen, presentationPdfUrl]);

  useEffect(() => {
    if (!isPresentationOpen || !presentationPdfUrl?.startsWith("/uploads/") || !isPdfSlideMode) {
      setPresentationLinks([]);
      setPresentationPageSize(null);
      return;
    }

    let isActive = true;

    void (async () => {
      try {
        const response = await fetch(toPdfPageLinksUrl(presentationPdfUrl, currentSlide), {
          method: "GET",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { links?: PdfPageLink[]; page?: PdfPageSize };
        if (isActive) {
          setPresentationLinks(payload.links ?? []);
          setPresentationPageSize(payload.page ?? null);
        }
      } catch {
        if (isActive) {
          setPresentationLinks([]);
          setPresentationPageSize(null);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [currentSlide, isPdfSlideMode, isPresentationOpen, presentationPdfUrl]);

  useEffect(() => {
    setCurrentSlide((prev) => clamp(prev, 1, presentationPages));
  }, [presentationPages]);

  useEffect(() => {
    if (!isPresentationOpen) return;
    const element = presentationFrameRef.current;
    if (!element) return;

    const updateFrameSize = () => {
      const rect = element.getBoundingClientRect();
      setPresentationFrameSize({ width: rect.width, height: rect.height });
    };

    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(element);
    window.addEventListener("resize", updateFrameSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFrameSize);
    };
  }, [isPresentationOpen]);

  useEffect(() => {
    if (!isPresentationOpen) return;
    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflowRef.current ?? "";
    };
  }, [isPresentationOpen]);

  useEffect(() => {
    if (isPresentationOpen) return;
    setResolvedPresentationPages(null);
    setPptxPreviewReady(null);
    setPptxHtml5Ready(null);
  }, [isPresentationOpen]);

  useEffect(() => {
    if (!isPresentationOpen || !isPdfSlideMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentSlide((prev) => clamp(prev + 1, 1, presentationPages));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentSlide((prev) => clamp(prev - 1, 1, presentationPages));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPresentationOpen, isPdfSlideMode, presentationPages]);

  async function markAsRead() {
    if (!canTrackProgress || isMarkingRead) return;
    setIsMarkingRead(true);
    try {
      const result = await persistMaterialProgress({
        courseItemId: item.id,
        event:
          type === "PDF"
            ? { type: "PRESENTATION_PAGE_VIEWED", page: currentSlide }
            : { type: "MATERIAL_COMPLETED" },
      });
      syncSavedProgress(result);
      if (courseCompletionHref && result.completed) {
        router.replace(courseCompletionHref);
      }
    } finally {
      setIsMarkingRead(false);
    }
  }

  async function saveCurrentProgress(options: { refresh?: boolean } = {}) {
    if (!canTrackProgress) return null;

    const result = await persistMaterialProgress({
      courseItemId: item.id,
      event:
        type === "PDF"
          ? { type: "PRESENTATION_PAGE_VIEWED", page: currentSlide }
          : { type: "MATERIAL_OPENED" },
    });
    syncSavedProgress(result, options);
    return result;
  }

  async function openVideo() {
    setIsVideoOpen(true);
    if (!canTrackProgress) return;
    try {
      const result = await persistMaterialProgress({
        courseItemId: item.id,
        event: { type: "MATERIAL_OPENED" },
      });
      syncSavedProgress(result);
    } catch {
      // no-op for MVP
    }
  }

  function openPresentation() {
    // Always resume from the last viewed slide.
    if (type === "PDF") {
      const slideToOpen = clamp(lastSeenSlide, 1, presentationPages);
      setCurrentSlide(slideToOpen);
      setPresentationOpenInitialSlide(slideToOpen);
      setForcePdfFallback(false);
    }
    setIsPresentationOpen(true);
  }

  function dismissOverlays() {
    setIsCompletionPromptOpen(false);
    setIsPresentationOpen(false);
    setIsVideoOpen(false);
    document.body.style.overflow = previousBodyOverflowRef.current ?? "";
  }

  async function closePresentation() {
    if (isFinalPresentationSlide && hasNextQuizAfterPresentation) {
      setIsCompletionPromptOpen(true);
      return;
    }

    if (courseCompletionHref && progressPercent >= 100) {
      void completeMaterialAndNavigate(courseCompletionHref);
      return;
    }

    try {
      await saveCurrentProgress();
    } catch {
      // no-op for MVP
    }

    dismissOverlays();
    if (closeHref) {
      router.replace(closeHref);
    }
  }

  async function closePresentationToCourseList() {
    try {
      await saveCurrentProgress();
    } catch {
      // no-op for MVP
    }

    dismissOverlays();
    if (closeHref) {
      router.replace(closeHref);
    }
  }

  async function closeVideo() {
    try {
      await saveCurrentProgress();
    } catch {
      // Closing a player must remain available when progress sync is temporarily unavailable.
    }
    dismissOverlays();
    if (closeHref) {
      router.replace(closeHref);
    }
  }

  async function completeMaterialAndNavigate(targetHref: string | undefined) {
    if (isFollowingCompletionLink) return;
    setIsFollowingCompletionLink(true);
    setCompletionError(null);
    let progressSaveError: Error | null = null;

    try {
      if (canTrackProgress) {
        try {
          const result = await persistMaterialProgress({
            courseItemId: item.id,
            event:
              type === "PDF"
                ? { type: "PRESENTATION_PAGE_VIEWED", page: currentSlide }
                : { type: "MATERIAL_COMPLETED" },
          });
          syncSavedProgress(result, { refresh: false });
          if (type === "PDF" && !result.completed) {
            throw new Error("Для завершения презентации нужно просмотреть все страницы.");
          }
        } catch (error) {
          progressSaveError =
            error instanceof Error
              ? error
              : new Error("Не удалось сохранить прогресс материала");
        }
      }

      if (progressSaveError) {
        setCompletionError(progressSaveError.message);
        return;
      }

      if (targetHref) {
        dismissOverlays();
        router.push(targetHref);
        return;
      }

      dismissOverlays();

      if (closeHref) {
        router.replace(closeHref);
      }
    } finally {
      setIsFollowingCompletionLink(false);
    }
  }

  function openPresentationLink(link: PdfPageLink) {
    if (isEndShowLink(link.href)) {
      void completeMaterialAndNavigate(completionHref);
      return;
    }

    if (link.href.startsWith("/")) {
      router.push(link.href);
      return;
    }

    try {
      const url = new URL(link.href, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
        window.open(url.href, "_blank", "noopener,noreferrer");
      }
    } catch {
      // Ignore unsupported PDF actions.
    }
  }

  async function toggleFullscreen(target: "presentation" | "video") {
    const element = target === "video" ? videoModalRef.current : modalRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await element.requestFullscreen();
  }

  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
      <div className="flex-1">
        <h4 className="text-sm font-semibold text-[var(--ink)]">{item.title}</h4>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          {label}
          {item.isRequired ? " · обязательный элемент" : " · ознакомительный"}
        </p>
      </div>

      {canTrackProgress && type !== "PDF" && (
        <div className="mt-3 w-full max-w-[460px] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-xs text-[var(--ink-muted)]">Прогресс раздела</div>
          <div className="mt-1 text-sm font-semibold">{progressPercent}%</div>
          <div className="mt-1 text-xs text-[var(--ink-muted)]">{sectionProgressText}</div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--line)]">
            <div
              className="h-1.5 rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <button
            type="button"
            onClick={markAsRead}
            disabled={isMarkingRead || progressPercent >= 100}
            className="mt-3 w-full rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-1.5 text-xs font-medium text-[var(--ink)] disabled:cursor-default disabled:opacity-60"
          >
            {progressPercent >= 100 ? "Ознакомлен" : isMarkingRead ? "Сохраняю..." : "Ознакомлен"}
          </button>
        </div>
      )}
      <div className="mt-4">
        {type === "TEXT" && richTextContent && (
          <div
            className="text-sm leading-relaxed text-[var(--ink)] [&_a]:text-[var(--accent)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--line)] [&_blockquote]:pl-4 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: richTextContent }}
          />
        )}

        {type === "VIDEO" && item.fileUrl && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--ink-muted)]">
              Нажмите «Открыть видео», чтобы смотреть его во встроенном плеере.
            </p>
            <button
              type="button"
              onClick={openVideo}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              Открыть видео
            </button>
          </div>
        )}

        {type === "PDF" && item.fileUrl && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--ink)]">Просмотр презентации</p>
            {isPptxMaterial ? (
              <>
                <p className="text-sm text-[var(--ink-muted)]">
                  {wantsHtml5Pptx
                    ? "Нажмите «Открыть HTML5», чтобы смотреть презентацию во встроенном HTML5-плеере без внешних сервисов."
                    : "Нажмите «Открыть презентацию» для встроенного просмотра слайдов."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      openPresentation();
                    }}
                    className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
                  >
                    {wantsHtml5Pptx ? "Открыть HTML5" : "Открыть презентацию"}
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--ink-muted)]">
                  Нажмите «Открыть презентацию», чтобы перейти в полноэкранный режим и листать
                  слайды.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openPresentation}
                    className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
                  >
                    Открыть презентацию
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {canTrackProgress && type === "PDF" && (
        <div className="mt-3 w-full max-w-[460px] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-xs text-[var(--ink-muted)]">Прогресс презентации</div>
          <div className="mt-1 text-sm font-semibold">{progressPercent}%</div>
          <div className="mt-1 text-xs text-[var(--ink-muted)]">{sectionProgressText}</div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--line)]">
            <div
              className="h-1.5 rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {isPresentationOpen && type === "PDF" && item.fileUrl && (
        <div
          ref={modalRef}
          className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4 text-white"
          onWheel={isPdfSlideMode ? (event) => event.preventDefault() : undefined}
          onTouchMove={isPdfSlideMode ? (event) => event.preventDefault() : undefined}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <h5 className="font-semibold">{item.title}</h5>
              <p className="max-w-[min(70vw,56rem)] truncate text-xs text-white/70">
                Курс: {courseTitle} · Слайд {currentSlide}
                {hasKnownPresentationPages ? ` из ${presentationPages}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToPrevSlide}
                disabled={!isPdfSlideMode || currentSlide <= 1}
                className="rounded-md border border-white/25 px-3 py-2 text-sm disabled:opacity-40"
              >
                Предыдущий
              </button>
              <button
                type="button"
                onClick={goToNextSlide}
                disabled={!isPdfSlideMode || (hasKnownPresentationPages && currentSlide >= presentationPages)}
                className="rounded-md border border-white/25 px-3 py-2 text-sm disabled:opacity-40"
              >
                Следующий
              </button>
              <button
                type="button"
                onClick={() => toggleFullscreen("presentation")}
                disabled={!isPdfSlideMode && !useHtml5Pptx}
                className="rounded-md border border-white/25 px-3 py-2 text-sm disabled:opacity-40"
              >
                Во весь экран
              </button>
              {wantsHtml5Pptx ? (
                canSwitchPresentationPreview ? (
                  <button
                    type="button"
                    onClick={() => setForcePdfFallback((value) => !value)}
                    className="rounded-md border border-white/25 px-3 py-2 text-sm"
                  >
                    {forcePdfFallback ? "HTML5" : "PDF-превью"}
                  </button>
                ) : null
              ) : null}
              <button
                type="button"
                onClick={closePresentation}
                className="rounded-md bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
              >
                Закрыть
              </button>
            </div>
          </div>

          <div
            ref={presentationFrameRef}
            className="relative mx-auto mt-4 h-full w-full max-w-7xl overflow-hidden rounded-lg border border-white/15 bg-black"
          >
            {useHtml5Pptx && pptxHtml5Url ? (
              <PptxHtml5PresentationFrame
                html5Url={pptxHtml5Url}
                title={item.title}
                initialSlide={presentationOpenInitialSlide}
                onFallback={() => setPptxHtml5Ready(false)}
              />
            ) : presentationPdfUrl ? (
              <>
                <button
                  type="button"
                  onClick={goToPrevSlide}
                  disabled={currentSlide <= 1}
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/70 px-3 py-2 text-sm disabled:opacity-40"
                  aria-label="Предыдущий слайд"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={goToNextSlide}
                  disabled={hasKnownPresentationPages && currentSlide >= presentationPages}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/70 px-3 py-2 text-sm disabled:opacity-40"
                  aria-label="Следующий слайд"
                >
                  →
                </button>
                {presentationSlideImageUrl ? (
                  <Image
                    key={presentationSlideImageUrl}
                    src={presentationSlideImageUrl}
                    alt={`${item.title}. Слайд ${currentSlide}`}
                    fill
                    unoptimized
                    sizes="100vw"
                    className="h-full w-full select-none object-contain"
                    draggable={false}
                  />
                ) : (
                  <iframe
                    key={`${presentationPdfUrl}-${currentSlide}`}
                    title={`${item.title} slide ${currentSlide}`}
                    className="h-full w-full pointer-events-none"
                    src={`${presentationPdfUrl}#page=${currentSlide}&zoom=page-fit&view=FitH&toolbar=0&navpanes=0&scrollbar=0&pagemode=none`}
                  />
                )}
                {positionedPresentationLinks.map((link, index) => (
                  <button
                    key={`${link.href}-${index}`}
                    type="button"
                    title={link.text || link.href}
                    aria-label={link.text ? `Открыть ссылку: ${link.text}` : "Открыть ссылку на слайде"}
                    disabled={isFollowingCompletionLink}
                    onClick={() => openPresentationLink(link)}
                    className="absolute z-20 cursor-pointer rounded-sm bg-transparent text-transparent outline-none transition hover:bg-[var(--accent)]/10 focus:bg-[var(--accent)]/15 focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-wait"
                    style={{
                      left: `${link.hitLeft}px`,
                      top: `${link.hitTop}px`,
                      width: `${link.hitWidth}px`,
                      height: `${link.hitHeight}px`,
                    }}
                  >
                    {link.text || link.href}
                  </button>
                ))}
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-2xl rounded-lg border border-white/15 bg-white/10 p-6">
                  <h6 className="text-lg font-semibold">
                    {pptxPreviewReady === false
                      ? "Не удалось подготовить предпросмотр PPTX"
                      : "Подготавливаю предпросмотр PPTX"}
                  </h6>
                  <p className="mt-3 text-sm text-white/70">
                    {pptxPreviewReady === false
                      ? "Попробуйте загрузить файл повторно. После успешной конвертации он откроется как PDF-слайды во встроенном плеере."
                      : "Идет конвертация презентации в PDF для встроенного плеера. Закройте окно и откройте снова через несколько секунд."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {isCompletionPromptOpen && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[var(--surface-raised)] p-5 text-[var(--ink)] shadow-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Презентация завершена
                </p>
                <h6 className="mt-2 text-xl font-semibold">Перейти к тесту?</h6>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                  Вы дошли до конца презентации. Следующий шаг курса
                  {completionTitle ? ` — «${completionTitle}»` : ""}. Можно сразу сохранить
                  прогресс и перейти к прохождению.
                </p>
                {completionError ? (
                  <p className="mt-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                    {completionError}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => completeMaterialAndNavigate(completionHref)}
                    disabled={isFollowingCompletionLink}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70"
                  >
                    {isFollowingCompletionLink ? "Сохраняю..." : "Перейти к тесту"}
                  </button>
                  <button
                    type="button"
                    onClick={closePresentationToCourseList}
                    disabled={isFollowingCompletionLink}
                    className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:cursor-wait disabled:opacity-70"
                  >
                    {closeHref ? "Вернуться к курсам" : "Закрыть презентацию"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCompletionPromptOpen(false)}
                    disabled={isFollowingCompletionLink}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] disabled:cursor-wait disabled:opacity-70"
                  >
                    Остаться в презентации
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isVideoOpen && type === "VIDEO" && item.fileUrl && (
        <div
          ref={videoModalRef}
          className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4 text-white"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <h5 className="font-semibold">{item.title}</h5>
              <p className="text-xs text-white/70">Встроенный видеоплеер</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleFullscreen("video")}
                className="rounded-md border border-white/25 px-3 py-2 text-sm"
              >
                Во весь экран
              </button>
              <button
                type="button"
                onClick={closeVideo}
                className="rounded-md bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
              >
                Закрыть
              </button>
            </div>
          </div>

          <div className="mx-auto mt-4 h-full w-full max-w-7xl overflow-hidden rounded-lg border border-white/15 bg-black">
            {isYouTubeUrl(item.fileUrl) ? (
              <iframe
                title={item.title}
                className="h-full w-full"
                src={toYouTubeEmbed(item.fileUrl) ?? undefined}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video className="h-full w-full" controls autoPlay src={item.fileUrl} />
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function PptxHtml5PresentationFrame({
  html5Url,
  title,
  initialSlide,
  onFallback,
}: {
  html5Url: string;
  title: string;
  initialSlide: number;
  onFallback: () => void;
}) {
  const [error, setError] = useState(false);
  const frameSrc = useMemo(() => {
    const slide = Math.max(1, Math.floor(initialSlide || 1));
    const separator = html5Url.includes("?") ? "&" : "?";
    return `${html5Url}${separator}slide=${encodeURIComponent(String(slide))}`;
  }, [html5Url, initialSlide]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-xl rounded-xl border border-white/15 bg-white/10 p-6 text-white">
          <h6 className="text-lg font-semibold">HTML5-плеер недоступен</h6>
          <p className="mt-2 text-sm text-white/70">Не удалось открыть подготовленный HTML5-пакет.</p>
          <button
            type="button"
            onClick={onFallback}
            className="mt-4 rounded-lg bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Открыть PDF-превью
          </button>
        </div>
      </div>
    );
  }

  // `allow-same-origin` в sandbox убран намеренно: вместе с `allow-scripts` он
  // снимает изоляцию целиком — загруженный пакет получал доступ к DOM и сессии
  // родителя. Плеер общается со страницей через postMessage, которому opaque
  // origin не мешает. Тот же набор дублируется заголовком CSP в /uploads.
  return (
    <iframe
      title={title}
      className="h-full w-full bg-black"
      src={frameSrc}
      sandbox="allow-scripts allow-popups"
      allowFullScreen
      onError={() => setError(true)}
    />
  );
}

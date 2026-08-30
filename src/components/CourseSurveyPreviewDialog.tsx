"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui";
import { CourseSurveyForm } from "@/components/CourseSurveyForm";
import {
  DEFAULT_COURSE_SURVEY_TITLE,
  formatCourseSurveyTitle,
  parseCourseSurveyQuestionsJson,
} from "@/lib/course-surveys";

type PreviewQuestion = {
  id: string;
  title: string;
  type: "RATING_5" | "SINGLE_CHOICE" | "TEXT";
  isRequired: boolean;
  options: string[];
};

type PreviewData = {
  title: string;
  description: string | null;
  introImageUrl: string | null;
  questions: PreviewQuestion[];
};

export function CourseSurveyPreviewDialog() {
  const [preview, setPreview] = useState<PreviewData | null>(null);

  function openPreview(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const questions = parseCourseSurveyQuestionsJson(String(formData.get("questionsJson") ?? "")).map(
      (question, index) => ({
        id: question.id ?? `preview-question-${index}`,
        title: question.title,
        type: question.type,
        isRequired: question.isRequired,
        options: question.options,
      })
    );
    const title = formatCourseSurveyTitle(String(formData.get("title") ?? "").trim() || DEFAULT_COURSE_SURVEY_TITLE);
    const description = String(formData.get("description") ?? "").trim();
    const introImageUrl = String(formData.get("introImageUrl") ?? "").trim();

    setPreview({
      title,
      description: description || null,
      introImageUrl: introImageUrl || null,
      questions,
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={openPreview}>
        <Eye className="h-4 w-4" aria-hidden="true" />
        Просмотр опроса
      </Button>

      {preview ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 py-6">
          <section className="w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-base font-semibold text-[var(--ink)]">Просмотр опроса</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">Так ученик увидит опрос.</p>
              </div>
              <button
                type="button"
                aria-label="Закрыть просмотр опроса"
                onClick={() => setPreview(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="bg-[var(--accent-soft)] px-4 py-5">
              <CourseSurveyForm
                key={`${preview.title}-${preview.questions.length}`}
                introTitle={preview.title}
                introDescription={preview.description}
                introImageUrl={preview.introImageUrl}
                questions={preview.questions}
                previewMode
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

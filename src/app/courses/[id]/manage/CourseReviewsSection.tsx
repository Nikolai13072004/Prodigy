import { ManualReviewsSection } from "./ManualReviewsSection";
import type {
  CourseManualReviewsData,
  CourseManualReviewStatusFilter,
} from "@/lib/course-manual-reviews";

type Props = {
  courseId: string;
  data: CourseManualReviewsData | null;
  statusFilter: CourseManualReviewStatusFilter;
  messages: {
    saved?: string;
    error?: string;
  };
};

const EMPTY_REVIEWS: CourseManualReviewsData = {
  summary: { total: 0, pending: 0, reviewed: 0 },
  rows: [],
  filteredRows: [],
  selectedAttempt: null,
};

export function CourseReviewsSection({ courseId, data, statusFilter, messages }: Props) {
  return (
    <div className="space-y-6">
      {messages.saved ? (
        <p className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]">
          {messages.saved}
        </p>
      ) : null}
      {messages.error ? (
        <p className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {messages.error}
        </p>
      ) : null}
      <ManualReviewsSection
        courseId={courseId}
        data={data ?? EMPTY_REVIEWS}
        statusFilter={statusFilter}
      />
    </div>
  );
}

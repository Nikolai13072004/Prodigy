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
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {messages.saved}
        </p>
      ) : null}
      {messages.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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

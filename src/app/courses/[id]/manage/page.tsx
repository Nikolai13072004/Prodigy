import { notFound } from "next/navigation";
import { requireCourseWorkspaceAccess } from "@/lib/auth-guards";
import { CourseManagementShell } from "@/app/courses/[id]/manage/CourseManagementShell";
import { CourseManagementSectionRenderer } from "@/app/courses/[id]/manage/CourseManagementSectionRenderer";
import { getCourseManagementPageModel } from "@/app/courses/[id]/manage/_queries/get-course-management-page-model";
import {
  selectCourseManagementRequest,
  type CourseManagementSearchParams,
} from "@/app/courses/[id]/manage/_queries/select-course-management-request";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<CourseManagementSearchParams>;
};

export default async function ManageCoursePage({ params, searchParams }: Props) {
  const { id: courseId } = await params;
  const access = await requireCourseWorkspaceAccess(courseId);
  const { canEditCourse, canPublishCourse, canManageAssignments } = access;
  const canOpenAccessSection = canEditCourse || canPublishCourse;
  const canOpenAssignmentsSection = canEditCourse || canManageAssignments;
  const permissions = {
    canEditCourse,
    canPublishCourse,
    canManageAssignments,
    canOpenAccessSection,
    canOpenAssignmentsSection,
  };
  const request = selectCourseManagementRequest(await searchParams, permissions);
  const model = await getCourseManagementPageModel({ courseId, request, permissions });
  if (!model) notFound();

  return (
    <CourseManagementShell
      courseId={courseId}
      returnUserId={model.shell.returnUserId}
      activeSection={model.activeSection}
      tabs={model.shell.tabs}
      attentionCards={model.shell.attentionCards}
      course={model.shell.course}
    >
      <CourseManagementSectionRenderer section={model.section} />
    </CourseManagementShell>
  );
}

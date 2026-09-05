import { requireSession } from "@/lib/auth-guards";
import { getPlatformSettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, STANDARD_ROLE_NAMES, hasPermission, hasRole } from "@/lib/roles";
import {
  getAdminStatusParam,
  getHrCategoryParam,
  getHrDifficultyParam,
  getLearnerCatalogDurationParam,
  getLearnerCatalogRatingParam,
  getLearnerTabParam,
} from "./_page-parts";
import { AdminCoursesView } from "./_views/AdminCoursesView";
import { HrCoursesView } from "./_views/HrCoursesView";
import { LearnerCoursesView } from "./_views/LearnerCoursesView";

type Props = {
  searchParams: Promise<{
    q?: string;
    tab?: string;
    status?: string;
    view?: string;
    category?: string;
    difficulty?: string;
    duration?: string;
    rating?: string;
  }>;
};

export default async function CoursesPage({ searchParams }: Props) {
  const session = await requireSession();
  const platformSettings = await getPlatformSettings();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const requestedLearnerTab = getLearnerTabParam(sp.tab);
  const learnerTab = requestedLearnerTab ?? "assigned";
  const adminStatus = getAdminStatusParam(sp.status);
  const hrCategory = getHrCategoryParam(sp.category);
  const hrDifficulty = getHrDifficultyParam(sp.difficulty);
  const learnerDuration = getLearnerCatalogDurationParam(sp.duration);
  const learnerRating = getLearnerCatalogRatingParam(sp.rating);
  const uiPreference = await prisma.userUiPreference.findUnique({
    where: { userId: session.user.id },
    select: { adminCoursesView: true, preferredRole: true },
  });
  const sessionRoles = session.user.roles?.length
    ? session.user.roles
    : session.user.role
      ? [session.user.role]
      : [];
  const preferredRole =
    uiPreference?.preferredRole && sessionRoles.includes(uiPreference.preferredRole)
      ? uiPreference.preferredRole
      : null;
  const learnerRole =
    requestedLearnerTab && sessionRoles.includes(STANDARD_ROLE_NAMES.STUDENT)
      ? STANDARD_ROLE_NAMES.STUDENT
      : null;
  const activeRole = learnerRole ?? preferredRole;
  const activeRoles = activeRole ? [activeRole] : sessionRoles;
  const activeRolePermissions =
    activeRole && ROLE_PERMISSIONS[activeRole] ? undefined : session.user.permissions;
  const canViewCourses = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_VIEW,
    activeRolePermissions
  );
  const canCreateCourses = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_CREATE_EDIT,
    activeRolePermissions
  );
  const canPublishCourses = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_PUBLISH,
    activeRolePermissions
  );
  const canManageAssignments = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    activeRolePermissions
  );
  const canTakeKnowledgeCheck = hasPermission(
    activeRoles,
    PERMISSIONS.LEARNING_KNOWLEDGE_CHECK,
    activeRolePermissions
  );
  const isHrDashboard = canManageAssignments && !canCreateCourses && !canPublishCourses && canViewCourses;
  const isStudentRole =
    hasRole(activeRoles, STANDARD_ROLE_NAMES.STUDENT) ||
    hasRole(activeRoles, ROLES.STUDENT);
  const shouldShowAdminCourses =
    canCreateCourses ||
    canPublishCourses ||
    (canViewCourses && !canTakeKnowledgeCheck && !isHrDashboard && !isStudentRole);
  const shouldUseLearnerCoursesView = isStudentRole && Boolean(requestedLearnerTab);

  if (shouldShowAdminCourses && !shouldUseLearnerCoursesView) {
    return (
      <AdminCoursesView
        q={q}
        adminStatus={adminStatus}
        adminViewParam={sp.view ?? uiPreference?.adminCoursesView}
        canCreateCourses={canCreateCourses}
      />
    );
  }

  if (isHrDashboard && !shouldUseLearnerCoursesView) {
    return <HrCoursesView q={q} hrCategory={hrCategory} hrDifficulty={hrDifficulty} />;
  }

  return (
    <LearnerCoursesView
      userId={session.user.id}
      q={q}
      learnerTab={learnerTab}
      hrCategory={hrCategory}
      hrDifficulty={hrDifficulty}
      learnerDuration={learnerDuration}
      learnerRating={learnerRating}
      shouldUseLearnerCoursesView={shouldUseLearnerCoursesView}
      feedbackEnabled={platformSettings.feedbackEnabled}
      canTakeKnowledgeCheck={canTakeKnowledgeCheck}
    />
  );
}

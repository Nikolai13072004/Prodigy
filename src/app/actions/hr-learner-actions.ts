"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, getAuditRequestContext } from "@/lib/audit-log";
import { PERMISSIONS } from "@/lib/roles";
import { BlockLearnerError } from "@/modules/user/application/block-learner-as-hr-errors";
import { blockLearnerAsHr as blockLearner } from "@/modules/user/server/block-learner-as-hr";

function learnerReportsUrl(params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value);
  }

  const query = search.toString();
  return query ? `/admin/reports/learner-progress?${query}` : "/admin/reports/learner-progress";
}

export async function blockLearnerAsHr(learnerId: string, courseId: string | undefined, _formData: FormData) {
  void _formData;
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_PROFILE);

  let result;
  try {
    result = await blockLearner({
      learnerId,
      source: courseId ? "course_learner_detail" : "learner_report_detail",
      actor: auditActorFromSessionUser(session.user),
      audit: await getAuditRequestContext(),
    });
  } catch (error) {
    if (error instanceof BlockLearnerError) {
      if (error.code === "NOT_FOUND") {
        redirect(learnerReportsUrl({ error: error.message }));
      }
      if (error.code === "NOT_STUDENT") {
        redirect(learnerReportsUrl({ error: error.message }));
      }
      if (error.code === "ALREADY_ARCHIVED") {
        redirect(
          learnerReportsUrl({
            userStatus: "blocked",
            q: error.login ?? undefined,
            error: error.message,
          })
        );
      }
      if (error.code === "ALREADY_BLOCKED") {
        redirect(
          learnerReportsUrl({
            userStatus: "blocked",
            q: error.login ?? undefined,
            notice: error.message,
          })
        );
      }
    }
    throw error;
  }

  const { learner, relatedCourseIds } = result;

  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/learner-progress");
  revalidatePath(`/admin/reports/${learner.id}`);
  revalidatePath("/courses");

  for (const relatedCourseId of new Set([
    ...relatedCourseIds,
    ...(courseId ? [courseId] : []),
  ])) {
    revalidatePath(`/courses/${relatedCourseId}/learners`);
    revalidatePath(`/courses/${relatedCourseId}/results`);
    revalidatePath(`/courses/${relatedCourseId}/learners/${learner.id}`);
  }

  redirect(
    learnerReportsUrl({
      userStatus: "blocked",
      q: learner.login,
      notice: `Ученик ${learner.name} заблокирован и перемещен в архив HR.`,
    })
  );
}

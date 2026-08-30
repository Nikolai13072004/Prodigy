import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent, resolveAuditRequestContext } from "@/lib/audit-log";
import { buildAnswersAnalysisXlsx, getAnswersAnalysisData } from "@/lib/answers-analysis-report";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!hasPermission(session.user.roles, PERMISSIONS.REPORTS_VIEW, session.user.permissions)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = (searchParams.get("courseId") ?? "").trim();
  if (!courseId) {
    return new NextResponse("courseId is required", { status: 400 });
  }

  const data = await getAnswersAnalysisData({ courseId });
  if (!data) {
    return new NextResponse("Course not found", { status: 404 });
  }

  const requestContext = resolveAuditRequestContext(request.headers);
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "exports:answers_analysis_report",
    objectType: "answers_analysis_report",
    objectLabel: data.course.title,
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
    metadata: {
      courseId: data.course.id,
      attemptsTotal: data.summary.attemptsTotal,
      uniqueLearners: data.summary.uniqueLearners,
    },
  });

  const workbook = buildAnswersAnalysisXlsx(data);
  return new NextResponse(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="answers-analysis-report.xlsx"',
    },
  });
}

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent, resolveAuditRequestContext } from "@/lib/audit-log";
import {
  buildFeedbackReportXlsx,
  getFeedbackReportData,
  getFeedbackReportRatingParam,
  getFeedbackReportStatusParam,
} from "@/lib/feedback-report";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!hasPermission(session.user.roles, PERMISSIONS.REPORTS_VIEW, session.user.permissions)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = getFeedbackReportStatusParam(searchParams.get("status"));
  const rating = getFeedbackReportRatingParam(searchParams.get("rating"));
  const data = await getFeedbackReportData({
    q: searchParams.get("q") ?? "",
    courseId: searchParams.get("courseId") ?? "",
    status,
    rating,
    createdFrom: searchParams.get("createdFrom") ?? "",
    createdTo: searchParams.get("createdTo") ?? "",
  });

  const requestContext = resolveAuditRequestContext(request.headers);
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "exports:feedback_report",
    objectType: "feedback_report",
    objectLabel: "Course feedback report",
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
    metadata: {
      q: searchParams.get("q") ?? "",
      courseId: searchParams.get("courseId") ?? "",
      status,
      rating,
      createdFrom: searchParams.get("createdFrom") ?? "",
      createdTo: searchParams.get("createdTo") ?? "",
      totalFeedbacks: data.summary.total,
    },
  });

  const workbook = buildFeedbackReportXlsx(data);
  return new NextResponse(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="feedback-report.xlsx"',
    },
  });
}

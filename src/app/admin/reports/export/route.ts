import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent, resolveAuditRequestContext } from "@/lib/audit-log";
import {
  buildLearnersReportCsv,
  buildLearnersReportXlsx,
  getLearnerReportSortParam,
  getLearnerReportStatusParam,
  getLearnerReportUserStatusParam,
  getLearnersReportData,
} from "@/lib/learners-report";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!hasPermission(session.user.roles, PERMISSIONS.REPORTS_VIEW, session.user.permissions)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = getLearnerReportStatusParam(searchParams.get("status"));
  const sort = getLearnerReportSortParam(searchParams.get("sort"));
  const userStatusFilter = getLearnerReportUserStatusParam(searchParams.get("userStatus"));
  const format = searchParams.get("format");
  const data = await getLearnersReportData({
    q: searchParams.get("q") ?? "",
    statusFilter,
    sort,
    userStatusFilter,
    courseId: searchParams.get("courseId") ?? "",
    assignedRange: searchParams.get("assignedRange") ?? "",
    groupId: searchParams.get("groupId") ?? "",
    departmentId: searchParams.get("departmentId") ?? "",
    registeredFrom: searchParams.get("registeredFrom") ?? "",
    registeredTo: searchParams.get("registeredTo") ?? "",
  });
  const requestContext = resolveAuditRequestContext(request.headers);
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "exports:learners_report",
    objectType: "learners_report",
    objectLabel: "Admin learners report",
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
    metadata: {
      format: format === "xlsx" ? "xlsx" : "csv",
      q: searchParams.get("q") ?? "",
      statusFilter,
      sort,
      userStatusFilter,
      courseId: searchParams.get("courseId") ?? "",
      assignedRange: searchParams.get("assignedRange") ?? "",
      groupId: searchParams.get("groupId") ?? "",
      departmentId: searchParams.get("departmentId") ?? "",
      registeredFrom: searchParams.get("registeredFrom") ?? "",
      registeredTo: searchParams.get("registeredTo") ?? "",
      totalLearners: data.summary.total,
    },
  });

  if (format === "xlsx") {
    const workbook = buildLearnersReportXlsx(data);
    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="learners-report.xlsx"',
      },
    });
  }

  const csv = buildLearnersReportCsv(data);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="learners-report.csv"',
    },
  });
}

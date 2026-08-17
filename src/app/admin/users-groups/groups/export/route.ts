import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent, resolveAuditRequestContext } from "@/lib/audit-log";
import {
  buildGroupProgressCsv,
  buildGroupProgressXlsx,
  getGroupProgressReportData,
} from "@/lib/group-progress-report";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

export async function GET(request: Request) {
  const session = await requireSession();
  const canViewGroups = hasPermission(session.user.roles, PERMISSIONS.GROUPS_VIEW, session.user.permissions);
  const canViewReports = hasPermission(session.user.roles, PERMISSIONS.REPORTS_VIEW, session.user.permissions);

  if (!canViewGroups || !canViewReports) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = (searchParams.get("groupId") ?? "").trim();
  const courseId = (searchParams.get("groupCourseId") ?? "").trim();
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (!groupId) {
    return new NextResponse("Group is required", { status: 400 });
  }

  const data = await getGroupProgressReportData({
    groupId,
    courseId,
  });

  if (!data) {
    return new NextResponse("Group not found", { status: 404 });
  }

  const requestContext = resolveAuditRequestContext(request.headers);
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "exports:group_progress",
    objectType: "group",
    objectId: data.group.id,
    objectLabel: data.group.name,
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
    metadata: {
      format,
      groupId: data.group.id,
      groupName: data.group.name,
      groupCourseId: data.courseFilter.selectedCourseId,
      groupCourseTitle: data.courseFilter.selectedCourseTitle,
      totalLearners: data.learners.length,
      comparedGroups: data.comparisonRows.length,
    },
  });

  const filenameBase = slugifyFilename(
    `group-progress-${data.group.name}${data.courseFilter.selectedCourseTitle ? `-${data.courseFilter.selectedCourseTitle}` : ""}`
  );

  if (format === "xlsx") {
    const workbook = buildGroupProgressXlsx(data);
    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${filenameBase}.xlsx`)}`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = buildGroupProgressCsv(data);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${filenameBase}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}

function slugifyFilename(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

  return normalized || "group-progress";
}

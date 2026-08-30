import { auth } from "@/auth";
import { auditActorFromSessionUser, recordAuditEvent, resolveAuditRequestContext } from "@/lib/audit-log";
import {
  buildCourseLearnersCsv,
  buildCourseLearnersXlsx,
  getCourseLearnerSortDirection,
  getCourseLearnerSortField,
  getLearnerAccessParam,
  getCourseLearnersData,
  getLearnerStatusParam,
} from "@/lib/course-learners";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Требуется вход.", { status: 401 });
  }

  const { id: courseId } = await params;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const statusFilter = getLearnerStatusParam(url.searchParams.get("status"));
  const accessFilter = getLearnerAccessParam(url.searchParams.get("access"));
  const sortBy = getCourseLearnerSortField(url.searchParams.get("sortBy"));
  const sortDir = getCourseLearnerSortDirection(url.searchParams.get("sortDir"));

  const data = await getCourseLearnersData({
    courseId,
    user: session.user,
    q,
    statusFilter,
    accessFilter,
    sortBy,
    sortDir,
  });

  if (!data) {
    return new Response("Курс не найден.", { status: 404 });
  }

  if (!data.access.canViewLearners) {
    return new Response("Недостаточно прав.", { status: 403 });
  }

  const filenameBase = slugifyFilename(data.course.title || "course-learners");
  const format = url.searchParams.get("format");
  const requestContext = resolveAuditRequestContext(request.headers);
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "exports:course_learners",
    objectType: "course",
    objectId: courseId,
    objectLabel: data.course.title,
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
    metadata: {
      format: format === "xlsx" ? "xlsx" : "csv",
      q,
      statusFilter,
      accessFilter,
      sortBy,
      sortDir,
      totalLearners: data.filteredLearners.length,
    },
  });

  if (format === "xlsx") {
    const workbook = buildCourseLearnersXlsx(data);
    return new Response(workbook, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${filenameBase}.xlsx`)}`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = buildCourseLearnersCsv(data);

  return new Response(csv, {
    status: 200,
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

  return normalized || "course-learners";
}

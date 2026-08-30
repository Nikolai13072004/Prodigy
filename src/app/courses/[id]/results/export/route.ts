import { NextResponse } from "next/server";
import {
  buildCourseResultsCsv,
  buildCourseResultsXlsx,
  getCourseResultsData,
  getResultStatusParam,
} from "@/lib/course-results";
import { requireSession } from "@/lib/auth-guards";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  const { id: courseId } = await context.params;
  const { searchParams } = new URL(request.url);
  const statusFilter = getResultStatusParam(searchParams.get("status"));
  const format = searchParams.get("format");

  const data = await getCourseResultsData({
    courseId,
    user: session.user,
    q: searchParams.get("q") ?? "",
    statusFilter,
  });

  if (!data) {
    return new NextResponse("Course not found", { status: 404 });
  }

  if (!data.access.canViewResults) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const filenameBase = `${slugifyFilename(data.course.title)}-results`;

  if (format === "xlsx") {
    const workbook = buildCourseResultsXlsx(data);
    return new NextResponse(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  const csv = buildCourseResultsCsv(data);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
    },
  });
}

function slugifyFilename(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "course-results";
}

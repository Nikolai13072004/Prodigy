import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildAuditLogCsv,
  buildAuditLogJson,
  getAuditLogExportItems,
  recordAuditEvent,
  resolveAuditRequestContext,
} from "@/lib/audit-log";
import { isPlatformAdminRole } from "@/lib/roles";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!isPlatformAdminRole(session.user.roles ?? [])) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const exportItems = await getAuditLogExportItems({
    q: url.searchParams.get("q"),
    actorId: url.searchParams.get("actorId"),
    action: url.searchParams.get("action"),
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
  });

  const requestContext = resolveAuditRequestContext(request.headers);
  await recordAuditEvent({
    actor: {
      id: session.user.id,
      login: session.user.email,
      name: session.user.name,
    },
    action: "exports:audit_log",
    objectType: "audit_log",
    objectLabel: `Audit log ${format.toUpperCase()}`,
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
    metadata: {
      format,
      count: exportItems.length,
      filters: {
        q: url.searchParams.get("q") ?? "",
        actorId: url.searchParams.get("actorId") ?? "",
        action: url.searchParams.get("action") ?? "",
        dateFrom: url.searchParams.get("dateFrom") ?? "",
        dateTo: url.searchParams.get("dateTo") ?? "",
      },
    },
  });

  if (format === "json") {
    return new NextResponse(buildAuditLogJson(exportItems), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit-log.json"',
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(buildAuditLogCsv(exportItems), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
      "Cache-Control": "no-store",
    },
  });
}

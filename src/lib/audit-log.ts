import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZES[1];

export type AuditLogWriteInput = {
  actor?: {
    id?: string | null;
    login?: string | null;
    name?: string | null;
  } | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  objectLabel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
  createdAt?: Date;
};

export type AuditLogFilterState = {
  q: string;
  actorId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: (typeof PAGE_SIZES)[number];
};

export type AuditLogListItem = {
  id: string;
  createdAt: Date;
  action: string;
  objectType: string;
  objectId: string | null;
  objectLabel: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  metadata: unknown;
};

type AuditLogRecord = Prisma.AuditLogEventGetPayload<{
  include: {
    actor: {
      select: {
        id: true;
        login: true;
        name: true;
      };
    };
  };
}>;

function parseDateInput(value: string | null | undefined) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function parsePositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00.000`);
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function firstForwardedIp(value: string | null | undefined) {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function normalizeHeaderValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function serializeMetadata(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({ serializationError: error instanceof Error ? error.message : "unknown" });
  }
}

function parseMetadata(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function resolveAuditRequestContext(headerSource: Pick<Headers, "get">) {
  const ipAddress =
    firstForwardedIp(headerSource.get("x-forwarded-for")) ??
    normalizeHeaderValue(headerSource.get("x-real-ip")) ??
    normalizeHeaderValue(headerSource.get("cf-connecting-ip"));

  return {
    ipAddress,
    userAgent: normalizeHeaderValue(headerSource.get("user-agent")),
  };
}

export async function getAuditRequestContext() {
  const headerStore = await headers();
  return resolveAuditRequestContext(headerStore);
}

export async function recordAuditEvent(input: AuditLogWriteInput) {
  try {
    const context =
      input.ipAddress !== undefined || input.userAgent !== undefined
        ? {
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
          }
        : await getAuditRequestContext();

    await prisma.auditLogEvent.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorLogin: input.actor?.login ?? null,
        actorName: input.actor?.name ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId ?? null,
        objectLabel: input.objectLabel ?? null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataJson: serializeMetadata(input.metadata),
        createdAt: input.createdAt,
      },
    });
  } catch (error) {
    console.error("Failed to record audit event", error);
  }
}

export function auditActorFromSessionUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}) {
  return {
    id: user.id,
    login: user.email ?? null,
    name: user.name ?? null,
  };
}

export async function pruneExpiredAuditLogEvents(retentionDays: number) {
  const safeRetentionDays = Math.max(retentionDays, 90);
  const threshold = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000);

  await prisma.auditLogEvent.deleteMany({
    where: {
      createdAt: {
        lt: threshold,
      },
    },
  });
}

export function normalizeAuditLogFilters(input: {
  q?: string | null;
  actorId?: string | null;
  action?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: string | null;
  pageSize?: string | null;
}): AuditLogFilterState {
  const page = parsePositiveInt(input.page, 1);
  const pageSize = PAGE_SIZES.includes(Number(input.pageSize) as (typeof PAGE_SIZES)[number])
    ? (Number(input.pageSize) as (typeof PAGE_SIZES)[number])
    : DEFAULT_PAGE_SIZE;

  return {
    q: String(input.q ?? "").trim(),
    actorId: String(input.actorId ?? "").trim(),
    action: String(input.action ?? "").trim(),
    dateFrom: parseDateInput(input.dateFrom),
    dateTo: parseDateInput(input.dateTo),
    page,
    pageSize,
  };
}

function buildAuditLogWhere(filters: AuditLogFilterState): Prisma.AuditLogEventWhereInput {
  const where: Prisma.AuditLogEventWhereInput = {};
  const clauses: Prisma.AuditLogEventWhereInput[] = [];

  if (filters.actorId) {
    clauses.push({ actorId: filters.actorId });
  }

  if (filters.action) {
    clauses.push({ action: filters.action });
  }

  if (filters.dateFrom || filters.dateTo) {
    clauses.push({
      createdAt: {
        ...(filters.dateFrom ? { gte: startOfDay(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: endOfDay(filters.dateTo) } : {}),
      },
    });
  }

  if (filters.q) {
    clauses.push({
      OR: [
        { actorName: { contains: filters.q } },
        { actorLogin: { contains: filters.q } },
        { action: { contains: filters.q } },
        { objectType: { contains: filters.q } },
        { objectId: { contains: filters.q } },
        { objectLabel: { contains: filters.q } },
        { ipAddress: { contains: filters.q } },
        { userAgent: { contains: filters.q } },
        { metadataJson: { contains: filters.q } },
      ],
    });
  }

  if (clauses.length) {
    where.AND = clauses;
  }

  return where;
}

function mapAuditLogItem(item: AuditLogRecord) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    action: item.action,
    objectType: item.objectType,
    objectId: item.objectId,
    objectLabel: item.objectLabel,
    ipAddress: item.ipAddress,
    userAgent: item.userAgent,
    actorId: item.actorId,
    actorLogin: item.actor?.login ?? item.actorLogin,
    actorName: item.actor?.name ?? item.actorName,
    metadata: parseMetadata(item.metadataJson),
  } satisfies AuditLogListItem;
}

export async function getAuditLogOverview(input: {
  q?: string | null;
  actorId?: string | null;
  action?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: string | null;
  pageSize?: string | null;
}) {
  const filters = normalizeAuditLogFilters(input);
  const where = buildAuditLogWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;

  const [items, totalCount, actionOptions, actorOptions] = await Promise.all([
    prisma.auditLogEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: filters.pageSize,
      include: {
        actor: {
          select: {
            id: true,
            login: true,
            name: true,
          },
        },
      },
    }),
    prisma.auditLogEvent.count({ where }),
    prisma.auditLogEvent.findMany({
      distinct: ["action"],
      orderBy: { action: "asc" },
      select: { action: true },
    }),
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { login: "asc" }],
      select: {
        id: true,
        name: true,
        login: true,
      },
    }),
  ]);

  return {
    filters,
    items: items.map((item) => mapAuditLogItem(item)),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / filters.pageSize)),
    actionOptions: actionOptions.map((item) => item.action),
    actorOptions,
  };
}

export async function getAuditLogExportItems(input: {
  q?: string | null;
  actorId?: string | null;
  action?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const filters = normalizeAuditLogFilters(input);
  const where = buildAuditLogWhere({ ...filters, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const items = await prisma.auditLogEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      actor: {
        select: {
          id: true,
          login: true,
          name: true,
        },
      },
    },
  });

  return items.map((item) => mapAuditLogItem(item));
}

export function formatAuditLogDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function describeAuditActor(item: Pick<AuditLogListItem, "actorId" | "actorName" | "actorLogin">) {
  if (!item.actorName && !item.actorLogin && !item.actorId) return "Система";
  const label = item.actorName || item.actorLogin || item.actorId || "Система";
  return item.actorLogin && item.actorLogin !== label ? `${label} (${item.actorLogin})` : label;
}

export function describeAuditObject(item: Pick<AuditLogListItem, "objectType" | "objectId" | "objectLabel">) {
  const base = item.objectLabel || item.objectId || item.objectType;
  if (item.objectLabel && item.objectId) {
    return `${item.objectLabel} [${item.objectId}]`;
  }
  return base;
}

export function buildAuditLogCsv(items: AuditLogListItem[]) {
  const header = [
    "Дата и время",
    "Пользователь ID",
    "Пользователь",
    "Логин",
    "Действие",
    "Объект",
    "Объект ID",
    "Объект тип",
    "IP-адрес",
    "User-Agent",
    "Метаданные",
  ];

  const rows = items.map((item) => [
    formatAuditLogDateTime(item.createdAt),
    item.actorId ?? "",
    item.actorName ?? "",
    item.actorLogin ?? "",
    item.action,
    item.objectLabel ?? "",
    item.objectId ?? "",
    item.objectType,
    item.ipAddress ?? "",
    item.userAgent ?? "",
    item.metadata ? JSON.stringify(item.metadata) : "",
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
    .join("\n");
}

export function buildAuditLogJson(items: AuditLogListItem[]) {
  return JSON.stringify(items, null, 2);
}

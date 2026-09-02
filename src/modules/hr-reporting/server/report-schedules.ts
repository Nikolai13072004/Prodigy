import "server-only";

import {
  getHrReportScheduleType,
  getHrReportScheduleTypeLabel,
  getInitialHrReportScheduleRunAt,
} from "@/lib/hr-report-schedules";
import { createManageReportSchedules } from "../application/manage-report-schedules";
import { prismaReportScheduleRepository } from "../infrastructure/prisma-report-schedule-repository";

export const reportSchedules = createManageReportSchedules({
  repository: prismaReportScheduleRepository,
  normalizeReportType: (value) => getHrReportScheduleType(value),
  describeReportType: (type, courseTitle) =>
    getHrReportScheduleTypeLabel(getHrReportScheduleType(type), courseTitle),
  initialRunAt: () => getInitialHrReportScheduleRunAt(),
});

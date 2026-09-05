export type ManageReportScheduleErrorCode = "COURSE_REQUIRED" | "NOT_FOUND";

// Ошибка управления расписанием HR-отчёта. Транспорт ловит её и делает redirect
// с scheduleError на страницу расписаний.
export class ManageReportScheduleError extends Error {
  constructor(
    readonly code: ManageReportScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ManageReportScheduleError";
  }
}

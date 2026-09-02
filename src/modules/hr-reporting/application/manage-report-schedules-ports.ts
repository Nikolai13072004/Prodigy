// Порты управления расписаниями HR-отчётов (create/toggle/delete).
// Мутация и аудит пишутся в одной транзакции (ADR-005).

export type PublishedCourse = { id: string; title: string };

export type OwnedScheduleRecord = {
  id: string;
  reportType: string;
  courseTitle: string | null;
  nextRunAt: Date;
  isPaused: boolean;
};

export type NewSchedule = {
  createdById: string;
  reportType: string;
  courseId: string | null;
  recipientsJson: string;
  nextRunAt: Date;
};

export type ScheduleAudit = {
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  objectLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
};

export interface ReportScheduleTransaction {
  createSchedule(data: NewSchedule): Promise<{ id: string }>;
  updatePause(scheduleId: string, isPaused: boolean, nextRunAt: Date): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;
  recordAudit(audit: ScheduleAudit): Promise<void>;
}

export interface ReportScheduleRepository {
  findPublishedCourse(courseId: string): Promise<PublishedCourse | null>;
  findOwnedSchedule(scheduleId: string, ownerId: string): Promise<OwnedScheduleRecord | null>;
  transact<T>(execute: (transaction: ReportScheduleTransaction) => Promise<T>): Promise<T>;
}

// Порты для операций поштучного доступа ученика к курсу
// (assignCourseToLearner, updateCourseLearnerAccess, updateCourseLearnersAccessBulk).
// Держим отдельно от EnrollmentMutation (там управление составом назначений
// целиком). Здесь — точечные апдейты expiresAt по конкретным (courseId, userId).

export type LearnerAccessAudit = {
  actorId: string;
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

export type CourseHead = {
  id: string;
  title: string;
  status: string;
};

export type LearnerHead = {
  id: string;
  name: string;
  email: string | null;
  firstName: string;
  status: string;
};

// Все expiresAt, влияющие на доступ одного ученика к одному курсу:
// прямые из CourseUserAssignment и наследованные через членство в группах.
export type LearnerAccessExpiries = {
  direct: (Date | null)[];
  group: (Date | null)[];
};

export type UpsertLearnerAssignmentInput = {
  learnerId: string;
  expiresAt: Date | null;
};

export type LearnerAccessEffects = {
  audit?: LearnerAccessAudit;
};

export interface LearnerAccessTransaction {
  // Ключ конфликта — @@unique([courseId, userId]) на CourseUserAssignment.
  // Приходит батч, но каждая строка апсертится отдельно (в prisma нет upsertMany).
  upsertLearnerAssignments(
    courseId: string,
    actorId: string,
    inputs: UpsertLearnerAssignmentInput[],
  ): Promise<void>;
  recordEffects(effects: LearnerAccessEffects): Promise<void>;
}

export interface LearnerAccessRepository {
  loadCourseHead(courseId: string): Promise<CourseHead | null>;
  loadLearners(learnerIds: string[]): Promise<LearnerHead[]>;
  // Активное назначение = есть строка, срок не истёк / бессрочно.
  // Возвращает true для случая, когда пользователь уже реально имеет доступ.
  hasActiveAssignment(courseId: string, userId: string): Promise<boolean>;
  loadLearnerAccessExpiries(
    courseId: string,
    learnerIds: string[],
  ): Promise<Map<string, LearnerAccessExpiries>>;
  transact<T>(
    execute: (transaction: LearnerAccessTransaction) => Promise<T>,
  ): Promise<T>;
}

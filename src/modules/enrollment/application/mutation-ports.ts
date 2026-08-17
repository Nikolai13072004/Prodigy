export type EnrollmentMutationState = {
  course: { title: string; status: string };
  directUserIds: string[];
  groupIds: string[];
  inheritedUserIds: string[];
};

export type EnrollmentRecipient = {
  userId: string;
  email: string;
  name: string | null;
  firstName: string | null;
};

export type PendingCourseInviteWrite = {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  accessExpiresAt: Date | null;
};

export type EnrollmentMutationEffects = {
  audit: {
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
  outboxEvents: Array<{
    topic: string;
    payload: unknown;
  }>;
};

export interface EnrollmentMutationTransaction {
  loadState(courseId: string): Promise<EnrollmentMutationState | null>;
  replaceState(args: {
    courseId: string;
    actorId: string;
    directUserIds: string[];
    groupIds: string[];
    accessExpiresAt: Date | null;
    pendingInviteDelete: "ALL" | string[];
    pendingInvites: PendingCourseInviteWrite[];
  }): Promise<void>;
  findActiveRecipients(directUserIds: string[], groupIds: string[]): Promise<EnrollmentRecipient[]>;
  recordEffects(effects: EnrollmentMutationEffects): Promise<void>;
}

export interface EnrollmentMutationRepository {
  transact<T>(execute: (transaction: EnrollmentMutationTransaction) => Promise<T>): Promise<T>;
}

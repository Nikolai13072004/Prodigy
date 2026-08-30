export type UnenrollmentLoadResult = {
  courseTitle: string;
  courseItemIds: string[];
  courseQuizIds: string[];
  hadDirectAssignment: boolean;
  hadGroupAssignment: boolean;
};

export type UnenrollmentWrite = {
  courseId: string;
  learnerId: string;
  actorId: string;
  assignmentAction: "OVERRIDE_EXPIRE" | "DELETE_DIRECT";
  overrideExpiresAt: Date;
  deleteProgress: boolean;
  courseItemIds: string[];
  courseQuizIds: string[];
};

export type UnenrollmentActor = { id: string; login: string | null; name: string | null };

export type UnenrollmentAudit = {
  actor: UnenrollmentActor;
  courseId: string;
  learnerId: string;
  objectLabel: string;
  hadDirectAssignment: boolean;
  hadGroupAssignment: boolean;
  deleteProgress: boolean;
  certificateRevoked: boolean;
  overrideExpiresAt: Date | null;
};

export interface UnenrollmentRepository {
  loadContext(courseId: string, learnerId: string): Promise<UnenrollmentLoadResult | null>;
  applyUnenrollment(write: UnenrollmentWrite): Promise<void>;
  revokeIssuedCertificate(args: {
    courseId: string;
    learnerId: string;
    actorId: string;
    now: Date;
  }): Promise<boolean>;
  recordAudit(audit: UnenrollmentAudit): Promise<void>;
}

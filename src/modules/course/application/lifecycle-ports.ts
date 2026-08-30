import type { CourseAuditActor } from "./ports";
import type { CoursePublicationCandidate, CourseStatus } from "../domain/course-lifecycle";

export type CourseLifecycleSnapshot = CoursePublicationCandidate & {
  id: string;
  status: string;
  publishedSnapshotJson: string;
};

export interface CourseLifecycleTransaction {
  load(courseId: string): Promise<CourseLifecycleSnapshot | null>;
  loadIdentity(courseId: string): Promise<{ id: string; title: string; status: string } | null>;
  changeStatus(args: {
    courseId: string;
    status: CourseStatus;
    publishedAt?: Date | null;
    publishedSnapshotJson?: string;
    hasUnpublishedChanges?: boolean;
  }): Promise<void>;
  delete(courseId: string): Promise<void>;
  recordAudit(args: {
    actor: CourseAuditActor;
    action: string;
    courseId: string;
    courseTitle: string;
    metadata: unknown;
  }): Promise<void>;
}

export interface CourseLifecycleRepository {
  transact<T>(execute: (transaction: CourseLifecycleTransaction) => Promise<T>): Promise<T>;
}

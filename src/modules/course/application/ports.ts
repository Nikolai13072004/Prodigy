import type { CourseProgressionItem, CourseProgressionPlan } from "../domain/progression-settings";

export type CourseAuditActor = {
  id: string;
  login: string | null;
  name: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type CourseDetails = {
  title: string;
  description: string | null;
  requirements: string | null;
  targetAudience: string | null;
  category: string | null;
  difficultyLevel: string | null;
  durationMinutes: number | null;
  tagsJson: string | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  navigationMode: string;
  resultViewMode: string;
};

export type CourseProgressionSnapshot = {
  id: string;
  title: string;
  navigationMode: string;
  completionMode: string;
  quizGateMode: string;
  statusFormat: string;
  gradedItemIdsJson: string | null;
  items: CourseProgressionItem[];
};

export interface CourseSettingsTransaction {
  loadDetails(courseId: string): Promise<(CourseDetails & { id: string }) | null>;
  updateDetails(courseId: string, details: CourseDetails): Promise<void>;
  loadTitle(courseId: string): Promise<{ id: string; title: string } | null>;
  updateTitle(courseId: string, title: string): Promise<void>;
  loadProgression(courseId: string): Promise<CourseProgressionSnapshot | null>;
  updateProgression(courseId: string, plan: CourseProgressionPlan): Promise<void>;
  markContentChanged(courseId: string): Promise<void>;
  recordAudit(args: {
    actor: CourseAuditActor;
    action: string;
    courseId: string;
    courseTitle: string;
    metadata: unknown;
  }): Promise<void>;
}

export interface CourseSettingsRepository {
  transact<T>(execute: (transaction: CourseSettingsTransaction) => Promise<T>): Promise<T>;
}

import type { MaterialLearningEvent, MaterialLearningProjection } from "@/modules/learning/domain/material-learning";

export type LearningMaterialRecord = {
  id: string;
  courseId: string;
  type: string;
  totalSlides: number | null;
  isRequired: boolean;
};

export type StoredMaterialProjection = {
  progressPercent: number;
  maxPageSeen: number;
  totalPages: number | null;
  viewedPages: number[];
} | null;

export interface LearningRepository {
  findMaterial(materialId: string): Promise<LearningMaterialRecord | null>;
  saveEventAndProject(args: {
    material: LearningMaterialRecord;
    userId: string;
    event: MaterialLearningEvent;
    project(previous: StoredMaterialProjection): MaterialLearningProjection;
  }): Promise<{ projection: MaterialLearningProjection; previousProgressPercent: number | null }>;
}

export interface LearningAccessPolicy {
  canRecord(args: {
    actorId: string;
    roles: string[];
    permissions: string[];
    courseId: string;
  }): Promise<boolean>;
}

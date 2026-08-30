export type EnrollmentAssignments = {
  directExpiries: Array<Date | null>;
  groupExpiries: Array<Date | null>;
};

export interface EnrollmentAccessRepository {
  findAssignments(courseId: string, userId: string): Promise<EnrollmentAssignments>;
}

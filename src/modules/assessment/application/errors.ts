import type { AssessmentDomainError } from "@/modules/assessment/domain/assessment";

export class AssessmentApplicationError extends Error {
  constructor(readonly code: AssessmentDomainError["code"], message: string) {
    super(message);
    this.name = "AssessmentApplicationError";
  }
}

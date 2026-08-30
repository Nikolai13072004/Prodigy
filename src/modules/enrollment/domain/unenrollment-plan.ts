export type UnenrollmentContext = {
  hadDirectAssignment: boolean;
  hadGroupAssignment: boolean;
};

export type UnenrollmentDecision =
  | { valid: false; reason: "NO_ASSIGNMENT" }
  | { valid: true; assignmentAction: "OVERRIDE_EXPIRE" | "DELETE_DIRECT" };

// Решение об отчислении. Групповое назначение — наследованное, его нельзя просто
// удалить: гасим персональным просроченным override. Прямое — удаляем. Нет ни того,
// ни другого — отчислять нечего.
export function planLearnerUnenrollment(context: UnenrollmentContext): UnenrollmentDecision {
  if (!context.hadDirectAssignment && !context.hadGroupAssignment) {
    return { valid: false, reason: "NO_ASSIGNMENT" };
  }
  return {
    valid: true,
    assignmentAction: context.hadGroupAssignment ? "OVERRIDE_EXPIRE" : "DELETE_DIRECT",
  };
}

import { STANDARD_ROLE_NAMES, primaryRole } from "@/lib/roles";
import { USER_STATUSES, isEditableUserStatus } from "@/lib/users";

// Чистое решение параметров нового аккаунта (createUser).
// Из прав (canEditAccessLevel) и полей формы выводит: слать ли инвайт, откуда пароль,
// роли/основную роль, статус и нужен ли токен активации. То же правило дублируется
// в user-import и hr-learner — единый источник здесь.

export type NewUserPasswordSource = "generate" | "input";

export type NewUserAccountPlan = {
  shouldSendInvite: boolean;
  passwordSource: NewUserPasswordSource;
  roles: string[];
  role: string;
  status: string;
  needsActivationToken: boolean;
};

export function resolveNewUserAccountPlan(input: {
  canEditAccessLevel: boolean;
  submitModeRaw: string;
  sendInviteChecked: boolean;
  collectedRoles: string[];
  statusRaw: string;
}): NewUserAccountPlan {
  const { canEditAccessLevel, submitModeRaw, sendInviteChecked, collectedRoles, statusRaw } = input;

  // Без права смены доступа режим всегда «invite», решение об отправке — по чекбоксу.
  const submitMode = canEditAccessLevel ? submitModeRaw : "invite";
  const shouldSendInvite = canEditAccessLevel ? submitMode === "invite" : sendInviteChecked;

  // Пароль вводится вручную только когда есть право доступа И инвайт не отправляется;
  // во всех остальных случаях генерируется по политике.
  const passwordSource: NewUserPasswordSource =
    canEditAccessLevel && !shouldSendInvite ? "input" : "generate";

  const roles = canEditAccessLevel ? collectedRoles : [STANDARD_ROLE_NAMES.STUDENT];
  const role = primaryRole(roles) ?? STANDARD_ROLE_NAMES.STUDENT;

  const status =
    canEditAccessLevel && shouldSendInvite
      ? USER_STATUSES.PENDING
      : canEditAccessLevel && isEditableUserStatus(statusRaw)
        ? statusRaw
        : USER_STATUSES.ACTIVE;

  const needsActivationToken = canEditAccessLevel && shouldSendInvite;

  return { shouldSendInvite, passwordSource, roles, role, status, needsActivationToken };
}

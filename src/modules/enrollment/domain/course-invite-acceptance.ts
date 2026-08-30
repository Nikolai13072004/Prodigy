import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";

// Чистые решения приёма приглашения на курс (acceptCourseInvite).
// Побочные эффекты (пометка EXPIRED, редиректы) остаются в транспорте — здесь только решение.

export type InviteStateResolution =
  | { kind: "ok" }
  | { kind: "rejected"; message: string }
  | { kind: "expired"; message: string };

// Состояние самого приглашения: активно / отклонено (не PENDING) / просрочено.
// `expired` — отдельный kind: транспорт по нему дополнительно помечает инвайт EXPIRED.
export function resolveInviteState(
  invite: { status: string; expiresAt: Date },
  now: Date,
): InviteStateResolution {
  if (invite.status !== "PENDING") {
    return {
      kind: "rejected",
      message:
        invite.status === "ACCEPTED"
          ? "Это приглашение уже использовано."
          : "Ссылка приглашения больше не активна.",
    };
  }
  if (invite.expiresAt.getTime() < now.getTime()) {
    return {
      kind: "expired",
      message:
        "Срок действия приглашения истек. Попросите администратора отправить новое письмо.",
    };
  }
  return { kind: "ok" };
}

export function userHasStudentRole(user: {
  role: string;
  userRoles: Array<{ roleProfile: { name: string } }>;
}): boolean {
  const roleNames = new Set(
    [user.role, ...user.userRoles.map((item) => item.roleProfile.name)].filter(Boolean),
  );
  return roleNames.has(STANDARD_ROLE_NAMES.STUDENT);
}

// Можно ли принять приглашение существующим по email пользователем:
// активен, имеет роль «Ученик», и введённый логин совпадает с его логином.
export function resolveExistingUserInviteAcceptance(input: {
  user: {
    status: string;
    login: string;
    role: string;
    userRoles: Array<{ roleProfile: { name: string } }>;
  };
  submittedLogin: string;
}): { kind: "ok" } | { kind: "error"; message: string } {
  const { user, submittedLogin } = input;

  if (user.status !== USER_STATUSES.ACTIVE) {
    return { kind: "error", message: "Пользователь с этим email заблокирован. Обратитесь к администратору." };
  }
  if (!userHasStudentRole(user)) {
    return {
      kind: "error",
      message: "Для этого email уже существует пользователь без роли 'Ученик'. Обратитесь к администратору.",
    };
  }
  if (user.login !== submittedLogin) {
    return {
      kind: "error",
      message: `Для этого email уже создан пользователь с логином ${user.login}. Используйте его для входа.`,
    };
  }
  return { kind: "ok" };
}

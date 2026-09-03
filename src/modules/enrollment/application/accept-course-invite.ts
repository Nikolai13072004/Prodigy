import type { PlatformSecuritySettingsState } from "@/lib/platform-settings";
import { validatePasswordAgainstPolicy } from "@/lib/platform-settings";
import {
  resolveExistingUserInviteAcceptance,
  resolveInviteState,
} from "../domain/course-invite-acceptance";
import { AcceptCourseInviteError } from "./accept-course-invite-errors";
import type { CourseInviteRepository } from "./accept-course-invite-ports";

export type AcceptCourseInviteInput = {
  token: string;
  name: string;
  login: string;
  password: string;
  securitySettings: PlatformSecuritySettingsState;
};

export type AcceptCourseInviteResult = {
  courseId: string;
  // true — создан новый пользователь (транспорту нужно ревалидировать список users-groups).
  createdUser: boolean;
};

export type AcceptCourseInviteDeps = {
  repository: CourseInviteRepository;
  hashPassword: (password: string) => Promise<string>;
};

// Приём приглашения на курс. Побочные эффекты транспорта (signIn, redirect,
// revalidatePath) остаются в action — здесь только решение и запись в БД.
export function createAcceptCourseInvite({ repository, hashPassword }: AcceptCourseInviteDeps) {
  return {
    async accept(input: AcceptCourseInviteInput): Promise<AcceptCourseInviteResult> {
      const { token, name, login, password, securitySettings } = input;

      const passwordError = validatePasswordAgainstPolicy(password, securitySettings);
      if (passwordError) {
        throw new AcceptCourseInviteError("VALIDATION_FAILED", passwordError);
      }

      const invite = await repository.findInviteByToken(token);
      if (!invite) {
        throw new AcceptCourseInviteError(
          "INVITE_NOT_FOUND",
          "Приглашение не найдено или уже недействительно.",
        );
      }

      const state = resolveInviteState(
        { status: invite.status, expiresAt: invite.expiresAt },
        new Date(),
      );
      if (state.kind === "rejected") {
        throw new AcceptCourseInviteError("INVITE_REJECTED", state.message);
      }
      if (state.kind === "expired") {
        await repository.markInviteExpired(invite.id);
        throw new AcceptCourseInviteError("INVITE_EXPIRED", state.message);
      }

      const studentRoleProfileId = await repository.findStudentRoleProfileId();
      if (!studentRoleProfileId) {
        throw new Error("Не удалось найти системную роль 'Ученик'");
      }

      const existingUser = await repository.findUserByEmail(invite.email);
      if (existingUser) {
        const acceptance = resolveExistingUserInviteAcceptance({
          user: existingUser,
          submittedLogin: login,
        });
        if (acceptance.kind === "error") {
          throw new AcceptCourseInviteError("EXISTING_USER_CONFLICT", acceptance.message);
        }

        await repository.acceptForExistingUser({
          inviteId: invite.id,
          courseId: invite.courseId,
          userId: existingUser.id,
          accessExpiresAt: invite.accessExpiresAt,
        });
        return { courseId: invite.courseId, createdUser: false };
      }

      const loginTaken = await repository.findUserIdByLogin(login);
      if (loginTaken) {
        throw new AcceptCourseInviteError(
          "LOGIN_TAKEN",
          "Пользователь с таким логином уже существует. Укажите другой логин.",
        );
      }

      const passwordHash = await hashPassword(password);
      try {
        await repository.createUserAndAccept({
          inviteId: invite.id,
          courseId: invite.courseId,
          name,
          login,
          email: invite.email,
          passwordHash,
          studentRoleProfileId,
          accessExpiresAt: invite.accessExpiresAt,
        });
      } catch (error) {
        if (repository.isUniqueViolation(error)) {
          throw new AcceptCourseInviteError(
            "REGISTRATION_CONFLICT",
            "Не удалось завершить регистрацию: логин или email уже заняты.",
          );
        }
        throw error;
      }
      return { courseId: invite.courseId, createdUser: true };
    },
  };
}

export type AcceptCourseInvite = ReturnType<typeof createAcceptCourseInvite>;

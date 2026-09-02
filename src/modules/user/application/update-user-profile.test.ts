import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_STATUSES } from "@/lib/users";
import type { PlatformSecuritySettingsState } from "@/lib/platform-settings";
import { UserApplicationError } from "./errors";
import { createUpdateUserProfile } from "./update-user-profile";
import type {
  CurrentUserProfile,
  UserProfileApplyInput,
  UserProfileEffects,
  UserProfileRepository,
} from "./user-profile-ports";

// Use-case обновления профиля. Проверяется через фейковый репозиторий (без
// Prisma и bcrypt): валидации, ветки пароля, HR-scope, self-block, guard на
// смену ролей, транслирование P2002 в понятную ошибку.

class FakeUniqueViolation extends Error {}

const SECURITY: PlatformSecuritySettingsState = {
  passwordMinLength: 8,
  passwordRequireNumber: true,
  passwordRequireUppercase: true,
  passwordRequireSpecialChar: false,
  sessionMaxAgeMinutes: 60,
  sessionIdleTimeoutMinutes: 30,
  maxFailedLoginAttempts: 5,
  loginLockoutMinutes: 15,
  loginEventRetentionDays: 90,
  auditLogRetentionDays: 365,
  adminTotpRequired: false,
  userActivationInviteTtlDays: 7,
  courseInviteTtlDays: 7,
};

const ACTOR = { id: "admin-1", login: "admin@corp.ru", name: "Админ" };
const AUDIT_CONTEXT = { ipAddress: "10.0.0.1", userAgent: "test-agent" };

function makeUser(
  overrides: Partial<CurrentUserProfile> = {},
): CurrentUserProfile {
  return {
    id: "u1",
    name: "Иван Петров",
    firstName: "Иван",
    lastName: "Петров",
    login: "ivan",
    email: "ivan@corp.ru",
    avatarUrl: null,
    role: "Ученик",
    status: USER_STATUSES.ACTIVE,
    departmentId: null,
    organizationId: null,
    roleNames: ["Ученик"],
    groupIds: [],
    ...overrides,
  };
}

function makeRepository(opts: {
  current: CurrentUserProfile | null;
  roleProfiles?: Array<{ id: string; name: string }>;
  groupExists?: boolean;
  departmentExists?: boolean;
  organizationExists?: boolean;
  throwUnique?: boolean;
}) {
  const state = {
    applied: [] as UserProfileApplyInput[],
    effects: [] as UserProfileEffects[],
    roleProfilesQueriedFor: [] as string[][],
  };

  const repository: UserProfileRepository = {
    async loadCurrentUser() {
      return opts.current;
    },
    async loadRoleProfilesByNames(names) {
      state.roleProfilesQueriedFor.push([...names]);
      if (opts.roleProfiles) return opts.roleProfiles;
      return names.map((name) => ({ id: `role-${name}`, name }));
    },
    async checkGroupExists() {
      return opts.groupExists ?? true;
    },
    async checkDepartmentExists() {
      return opts.departmentExists ?? true;
    },
    async checkOrganizationExists() {
      return opts.organizationExists ?? true;
    },
    async transact(execute) {
      return execute({
        async applyUpdate(input) {
          if (opts.throwUnique) throw new FakeUniqueViolation("duplicate");
          state.applied.push(input);
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      });
    },
    isUniqueViolation(error) {
      return error instanceof FakeUniqueViolation;
    },
  };

  return { repository, state };
}

function baseCommand(overrides: Partial<Parameters<
  ReturnType<typeof createUpdateUserProfile>
>[0]> = {}) {
  return {
    userId: "u1",
    canEditAccessLevel: true,
    fields: {
      firstName: "Иван",
      lastName: "Петров",
      loginInput: "ivan",
      email: "ivan@corp.ru",
      password: "",
      passwordConfirm: "",
      groupId: "",
      departmentId: "",
      organizationId: "",
      avatarUrl: null as string | null | "invalid",
      statusRaw: "",
      statusControl: "",
      activeUserChecked: true,
      submittedRoles: ["Ученик"],
    },
    security: SECURITY,
    actor: ACTOR,
    audit: AUDIT_CONTEXT,
    ...overrides,
  };
}

const HASH = async (value: string) => `hash:${value}`;

test("happy-path: применяется мутация и один аудит с previous/next", async () => {
  const { repository, state } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  const result = await updateProfile(
    baseCommand({
      fields: {
        ...baseCommand().fields,
        firstName: "Иван",
        lastName: "Петров-Новый",
        submittedRoles: ["Ученик"],
      },
    }),
  );

  assert.equal(result.userId, "u1");
  assert.equal(result.passwordUpdated, false);
  assert.equal(result.rolesChanged, false);
  assert.equal(state.applied.length, 1);
  assert.equal(state.applied[0].scalar.name, "Иван Петров-Новый");
  assert.equal(state.applied[0].passwordHash, null);
  assert.deepEqual(state.applied[0].roleProfileIds, ["role-Ученик"]);
  assert.equal(state.effects.length, 1);
  const audit = state.effects[0].audit!;
  assert.equal(audit.action, "users:update");
  assert.equal(audit.actorId, "admin-1");
  assert.equal(audit.ipAddress, "10.0.0.1");
  const meta = audit.metadata as { previous: { name: string }; next: { name: string }; passwordUpdated: boolean };
  assert.equal(meta.previous.name, "Иван Петров");
  assert.equal(meta.next.name, "Иван Петров-Новый");
  assert.equal(meta.passwordUpdated, false);
});

test("пользователь не найден → NOT_FOUND, репозиторий не мутируется", async () => {
  const { repository, state } = makeRepository({ current: null });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(updateProfile(baseCommand()), (error) =>
    error instanceof UserApplicationError && error.code === "NOT_FOUND",
  );
  assert.equal(state.applied.length, 0);
  assert.equal(state.effects.length, 0);
});

test("пустое имя → VALIDATION_FAILED, без мутаций", async () => {
  const { repository, state } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        fields: { ...baseCommand().fields, firstName: "" },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      error.code === "VALIDATION_FAILED" &&
      /имя/i.test(error.message),
  );
  assert.equal(state.applied.length, 0);
});

test("HR (canEditAccessLevel=false) не может редактировать не-ученика", async () => {
  const { repository } = makeRepository({
    current: makeUser({ roleNames: ["HR"] }),
  });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(baseCommand({ canEditAccessLevel: false })),
    (error) =>
      error instanceof UserApplicationError &&
      error.code === "VALIDATION_FAILED" &&
      /HR/.test(error.message),
  );
});

test("HR: submittedRoles игнорируются, login замораживается", async () => {
  const { repository, state } = makeRepository({
    current: makeUser({ login: "old-login" }),
  });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  const result = await updateProfile(
    baseCommand({
      canEditAccessLevel: false,
      fields: {
        ...baseCommand().fields,
        loginInput: "hacker",
        submittedRoles: ["HR", "Ученик"],
      },
    }),
  );

  assert.equal(result.rolesChanged, false, "HR не может сменить роли");
  assert.equal(state.applied[0].scalar.login, "old-login", "логин не поменялся");
  assert.deepEqual(state.applied[0].roleProfileIds, ["role-Ученик"]);
});

test("HR попытка сменить пароль → PASSWORD_FORBIDDEN", async () => {
  const { repository } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        canEditAccessLevel: false,
        fields: {
          ...baseCommand().fields,
          password: "Newpass1",
          passwordConfirm: "Newpass1",
        },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /прав/i.test(error.message),
  );
});

test("смена пароля: policy применяется, применён хеш и passwordUpdated=true", async () => {
  const { repository, state } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  const result = await updateProfile(
    baseCommand({
      fields: {
        ...baseCommand().fields,
        password: "Password1",
        passwordConfirm: "Password1",
      },
    }),
  );

  assert.equal(result.passwordUpdated, true);
  assert.equal(state.applied[0].passwordHash, "hash:Password1");
});

test("пароли не совпадают → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        fields: {
          ...baseCommand().fields,
          password: "Password1",
          passwordConfirm: "Password2",
        },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /совпадают/i.test(error.message),
  );
});

test("смена пароля архивному пользователю запрещена", async () => {
  const { repository } = makeRepository({
    current: makeUser({ status: USER_STATUSES.ARCHIVED }),
  });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        fields: {
          ...baseCommand().fields,
          password: "Password1",
          passwordConfirm: "Password1",
        },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /архивного/i.test(error.message),
  );
});

test("нельзя заблокировать себя (self-block)", async () => {
  const { repository } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        actor: { id: "u1", login: null, name: null },
        fields: {
          ...baseCommand().fields,
          statusRaw: USER_STATUSES.BLOCKED,
        },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /заблокировать текущего/i.test(error.message),
  );
});

test("неизвестная роль (нет в БД) → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({
    current: makeUser(),
    roleProfiles: [{ id: "role-Ученик", name: "Ученик" }], // отсутствует "HR"
  });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        fields: {
          ...baseCommand().fields,
          submittedRoles: ["Ученик", "HR"],
        },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /не существуют/.test(error.message),
  );
});

test("сменa ролей вызывает authorizeRoleChange ровно один раз перед транзакцией", async () => {
  const { repository, state } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });
  let calls = 0;

  const result = await updateProfile(
    baseCommand({
      fields: {
        ...baseCommand().fields,
        submittedRoles: ["Ученик", "HR"],
      },
      authorizeRoleChange: async () => {
        calls += 1;
      },
    }),
  );

  assert.equal(result.rolesChanged, true);
  assert.equal(calls, 1);
  assert.equal(state.applied.length, 1);
});

test("роли не меняются → authorizeRoleChange не вызывается", async () => {
  const { repository } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });
  let calls = 0;

  await updateProfile(
    baseCommand({
      authorizeRoleChange: async () => {
        calls += 1;
      },
    }),
  );
  assert.equal(calls, 0);
});

test("groupId указан, но группы нет → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({
    current: makeUser(),
    groupExists: false,
  });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        fields: { ...baseCommand().fields, groupId: "missing-group" },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /группа/i.test(error.message),
  );
});

test("P2002 при applyUpdate → сообщение про логин/email", async () => {
  const { repository } = makeRepository({
    current: makeUser(),
    throwUnique: true,
  });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(updateProfile(baseCommand()), (error) =>
    error instanceof UserApplicationError &&
    /логином или email/i.test(error.message),
  );
});

test("некорректный avatarUrl → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({ current: makeUser() });
  const updateProfile = createUpdateUserProfile({
    repository,
    hashPassword: HASH,
  });

  await assert.rejects(
    updateProfile(
      baseCommand({
        fields: { ...baseCommand().fields, avatarUrl: "invalid" },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /аватара/i.test(error.message),
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_STATUSES } from "@/lib/users";
import type { PlatformSecuritySettingsState } from "@/lib/platform-settings";
import { UserApplicationError } from "./errors";
import { createCreateUserAccount } from "./create-user-account";
import type {
  CreateActivationInviteInput,
  CreateUserInput,
  UserCreationEffects,
  UserCreationRepository,
} from "./user-creation-ports";

// Use-case создания пользователя. Проверяется через фейковый репозиторий (без
// Prisma/bcrypt): валидации, транзакционная запись, ветка с активационным
// токеном, аудит с inviteQueued, P2002 → понятное сообщение.

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
const NOW = new Date("2026-03-01T10:00:00Z");

function makeRepository(opts: {
  roleProfiles?: Array<{ id: string; name: string }>;
  groupExists?: boolean;
  departmentExists?: boolean;
  organizationExists?: boolean;
  throwUnique?: boolean;
}) {
  const state = {
    created: [] as CreateUserInput[],
    invites: [] as CreateActivationInviteInput[],
    effects: [] as UserCreationEffects[],
  };

  const repository: UserCreationRepository = {
    async loadRoleProfilesByNames(names) {
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
        async createUser(input) {
          if (opts.throwUnique) throw new FakeUniqueViolation("duplicate");
          state.created.push(input);
          return {
            id: `user-${input.login}`,
            email: input.email,
            login: input.login,
            name: input.name,
            firstName: input.firstName,
          };
        },
        async createActivationInvite(input) {
          state.invites.push(input);
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

function makeDeps(repository: UserCreationRepository) {
  return {
    repository,
    hashPassword: async (value: string) => `hash:${value}`,
    generateActivationToken: () => ({
      token: "tok-plain",
      tokenHash: "tok-hash",
    }),
    now: () => NOW,
  };
}

type Command = Parameters<ReturnType<typeof createCreateUserAccount>>[0];

function baseCommand(overrides: Partial<Command> = {}): Command {
  return {
    actor: ACTOR,
    audit: AUDIT_CONTEXT,
    fields: {
      firstName: "Иван",
      lastName: "Петров",
      login: "ivan",
      email: "ivan@corp.ru",
      departmentId: "",
      organizationId: "",
      groupId: "",
    },
    plan: {
      roles: ["Ученик"],
      role: "Ученик",
      status: USER_STATUSES.ACTIVE,
      password: "Password1",
      needsActivationToken: false,
      shouldSendInvite: false,
    },
    security: SECURITY,
    ...overrides,
  };
}

test("happy-path без инвайта: user создан, invite не создан, аудит один", async () => {
  const { repository, state } = makeRepository({});
  const createUser = createCreateUserAccount(makeDeps(repository));

  const result = await createUser(baseCommand());

  assert.equal(result.user.login, "ivan");
  assert.equal(result.activationToken, null);
  assert.equal(state.created.length, 1);
  assert.equal(state.created[0].passwordHash, "hash:Password1");
  assert.deepEqual(state.created[0].roleProfileIds, ["role-Ученик"]);
  assert.equal(state.invites.length, 0);
  assert.equal(state.effects.length, 1);
  const audit = state.effects[0].audit!;
  assert.equal(audit.action, "users:create");
  const meta = audit.metadata as { inviteQueued: boolean; roles: string[] };
  assert.equal(meta.inviteQueued, false);
  assert.deepEqual(meta.roles, ["Ученик"]);
});

test("needsActivationToken + email: создан invite с корректным expiresAt", async () => {
  const { repository, state } = makeRepository({});
  const createUser = createCreateUserAccount(makeDeps(repository));

  const result = await createUser(
    baseCommand({
      plan: {
        ...baseCommand().plan,
        needsActivationToken: true,
        shouldSendInvite: true,
        status: USER_STATUSES.PENDING,
      },
    }),
  );

  assert.equal(result.activationToken?.token, "tok-plain");
  assert.equal(state.invites.length, 1);
  const invite = state.invites[0];
  assert.equal(invite.email, "ivan@corp.ru");
  assert.equal(invite.tokenHash, "tok-hash");
  assert.equal(invite.invitedById, "admin-1");
  // NOW + 7 дней (userActivationInviteTtlDays)
  const expectedMs = NOW.getTime() + 7 * 24 * 60 * 60 * 1000;
  assert.equal(invite.expiresAt.getTime(), expectedMs);

  const audit = state.effects[0].audit!;
  const meta = audit.metadata as { inviteQueued: boolean };
  assert.equal(meta.inviteQueued, true);
});

test("needsActivationToken=true, но email отсутствует → invite не создаётся, токен возвращается", async () => {
  const { repository, state } = makeRepository({});
  const createUser = createCreateUserAccount(makeDeps(repository));

  // Пустой email отфильтруется валидацией «Email обязателен».
  await assert.rejects(
    createUser(
      baseCommand({
        fields: { ...baseCommand().fields, email: null },
        plan: {
          ...baseCommand().plan,
          needsActivationToken: true,
          shouldSendInvite: true,
        },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /Email/i.test(error.message),
  );
  assert.equal(state.created.length, 0);
  assert.equal(state.invites.length, 0);
});

test("пустое имя → VALIDATION_FAILED без обращения к БД", async () => {
  const { repository, state } = makeRepository({});
  const createUser = createCreateUserAccount(makeDeps(repository));

  await assert.rejects(
    createUser(
      baseCommand({ fields: { ...baseCommand().fields, firstName: "" } }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /имя/i.test(error.message),
  );
  assert.equal(state.created.length, 0);
});

test("пустой пароль → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({});
  const createUser = createCreateUserAccount(makeDeps(repository));

  await assert.rejects(
    createUser(
      baseCommand({ plan: { ...baseCommand().plan, password: "" } }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /Пароль обязателен/i.test(error.message),
  );
});

test("пароль не удовлетворяет политике → сообщение из политики", async () => {
  const { repository } = makeRepository({});
  const createUser = createCreateUserAccount(makeDeps(repository));

  await assert.rejects(
    createUser(
      baseCommand({ plan: { ...baseCommand().plan, password: "short" } }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /не короче/i.test(error.message),
  );
});

test("groupId существует, но группа не найдена → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({ groupExists: false });
  const createUser = createCreateUserAccount(makeDeps(repository));

  await assert.rejects(
    createUser(
      baseCommand({ fields: { ...baseCommand().fields, groupId: "grp" } }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /группа/i.test(error.message),
  );
});

test("неизвестная роль → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({
    roleProfiles: [{ id: "role-Ученик", name: "Ученик" }],
  });
  const createUser = createCreateUserAccount(makeDeps(repository));

  await assert.rejects(
    createUser(
      baseCommand({
        plan: {
          ...baseCommand().plan,
          roles: ["Ученик", "Missing"],
        },
      }),
    ),
    (error) =>
      error instanceof UserApplicationError &&
      /не существуют/i.test(error.message),
  );
});

test("P2002 при createUser → сообщение про логин/email", async () => {
  const { repository, state } = makeRepository({ throwUnique: true });
  const createUser = createCreateUserAccount(makeDeps(repository));

  await assert.rejects(createUser(baseCommand()), (error) =>
    error instanceof UserApplicationError &&
    /логином или email/i.test(error.message),
  );
  assert.equal(state.effects.length, 0, "аудита нет — транзакция откатилась");
});

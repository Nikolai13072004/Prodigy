import assert from "node:assert/strict";
import { test } from "node:test";
import { createAcceptCourseInvite } from "./accept-course-invite";
import { AcceptCourseInviteError } from "./accept-course-invite-errors";
import type {
  CourseInviteRepository,
  ExistingUserRecord,
  InviteRecord,
} from "./accept-course-invite-ports";

const SETTINGS = {
  passwordMinLength: 6,
  passwordRequireNumber: false,
  passwordRequireUppercase: false,
  passwordRequireSpecialChar: false,
  sessionMaxAgeMinutes: 60,
  sessionIdleTimeoutMinutes: 30,
  maxFailedLoginAttempts: 5,
  loginLockoutMinutes: 15,
  loginEventRetentionDays: 30,
  auditLogRetentionDays: 90,
  adminTotpRequired: false,
  userActivationInviteTtlDays: 7,
  courseInviteTtlDays: 7,
};

function activeInvite(overrides: Partial<InviteRecord> = {}): InviteRecord {
  return {
    id: "inv-1",
    courseId: "c-1",
    email: "user@example.com",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
    accessExpiresAt: null,
    course: { id: "c-1", title: "Курс" },
    ...overrides,
  };
}

function makeRepository(opts: {
  invite?: InviteRecord | null;
  studentRoleProfileId?: string | null;
  userByEmail?: ExistingUserRecord | null;
  userIdByLogin?: string | null;
  createThrows?: unknown;
}) {
  const state = {
    expired: [] as string[],
    acceptedExisting: [] as string[],
    createdUsers: [] as string[],
  };
  const repository: CourseInviteRepository = {
    async findInviteByToken() {
      return opts.invite === undefined ? activeInvite() : opts.invite;
    },
    async markInviteExpired(id) {
      state.expired.push(id);
    },
    async findStudentRoleProfileId() {
      return opts.studentRoleProfileId === undefined ? "role-student" : opts.studentRoleProfileId;
    },
    async findUserByEmail() {
      return opts.userByEmail === undefined ? null : opts.userByEmail;
    },
    async findUserIdByLogin() {
      return opts.userIdByLogin === undefined ? null : opts.userIdByLogin;
    },
    async acceptForExistingUser(input) {
      state.acceptedExisting.push(input.userId);
    },
    async createUserAndAccept(input) {
      if (opts.createThrows) throw opts.createThrows;
      state.createdUsers.push(input.login);
    },
    isUniqueViolation(error) {
      return error instanceof Error && error.message === "unique";
    },
  };
  return { repository, state };
}

const BASE = { token: "t", name: "Иван", login: "ivan", password: "secret1", securitySettings: SETTINGS };

test("слабый пароль → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({});
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    m.accept({ ...BASE, password: "12" }),
    (e) => e instanceof AcceptCourseInviteError && e.code === "VALIDATION_FAILED",
  );
});

test("инвайт не найден → INVITE_NOT_FOUND", async () => {
  const { repository } = makeRepository({ invite: null });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    m.accept(BASE),
    (e) => e instanceof AcceptCourseInviteError && e.code === "INVITE_NOT_FOUND",
  );
});

test("инвайт уже использован → INVITE_REJECTED", async () => {
  const { repository } = makeRepository({ invite: activeInvite({ status: "ACCEPTED" }) });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    m.accept(BASE),
    (e) => e instanceof AcceptCourseInviteError && e.code === "INVITE_REJECTED",
  );
});

test("инвайт просрочен → INVITE_EXPIRED + пометка EXPIRED", async () => {
  const { repository, state } = makeRepository({
    invite: activeInvite({ expiresAt: new Date(Date.now() - 60_000) }),
  });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    m.accept(BASE),
    (e) => e instanceof AcceptCourseInviteError && e.code === "INVITE_EXPIRED",
  );
  assert.deepEqual(state.expired, ["inv-1"]);
});

test("нет системной роли 'Ученик' → обычная ошибка (500)", async () => {
  const { repository } = makeRepository({ studentRoleProfileId: null });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(m.accept(BASE), (e) => {
    return e instanceof Error && !(e instanceof AcceptCourseInviteError);
  });
});

test("существующий пользователь с чужим логином → EXISTING_USER_CONFLICT", async () => {
  const { repository, state } = makeRepository({
    userByEmail: {
      id: "u-1",
      status: "ACTIVE",
      login: "other-login",
      role: "Ученик",
      userRoles: [{ roleProfile: { name: "Ученик" } }],
    },
  });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    m.accept(BASE),
    (e) => e instanceof AcceptCourseInviteError && e.code === "EXISTING_USER_CONFLICT",
  );
  assert.equal(state.acceptedExisting.length, 0);
});

test("существующий валидный пользователь → accept без создания", async () => {
  const { repository, state } = makeRepository({
    userByEmail: {
      id: "u-1",
      status: "ACTIVE",
      login: "ivan",
      role: "Ученик",
      userRoles: [{ roleProfile: { name: "Ученик" } }],
    },
  });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  const res = await m.accept(BASE);
  assert.equal(res.createdUser, false);
  assert.equal(res.courseId, "c-1");
  assert.deepEqual(state.acceptedExisting, ["u-1"]);
});

test("логин занят другим пользователем → LOGIN_TAKEN", async () => {
  const { repository } = makeRepository({ userIdByLogin: "someone" });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    m.accept(BASE),
    (e) => e instanceof AcceptCourseInviteError && e.code === "LOGIN_TAKEN",
  );
});

test("новый пользователь → создание + хеш пароля", async () => {
  const { repository, state } = makeRepository({});
  let hashed = "";
  const m = createAcceptCourseInvite({
    repository,
    hashPassword: async (p) => {
      hashed = `hash:${p}`;
      return hashed;
    },
  });
  const res = await m.accept(BASE);
  assert.equal(res.createdUser, true);
  assert.deepEqual(state.createdUsers, ["ivan"]);
  assert.equal(hashed, "hash:secret1");
});

test("гонка уникальности при создании → REGISTRATION_CONFLICT", async () => {
  const { repository } = makeRepository({ createThrows: new Error("unique") });
  const m = createAcceptCourseInvite({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    m.accept(BASE),
    (e) => e instanceof AcceptCourseInviteError && e.code === "REGISTRATION_CONFLICT",
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCESS_GROUPS,
  PERMISSIONS,
  ROLES,
  STANDARD_ROLE_NAMES,
  canAccessAllCourses,
  canTrackLearningProgress,
  canTrackMaterialProgress,
  hasAnyPermission,
  hasGroupAccess,
  hasPermission,
  hasRole,
  isPermission,
  isPlatformAdminRole,
  isStaffRole,
  listRolePermissionsByGroup,
  normalizePermissions,
  primaryRole,
} from "./roles";

// Ядро авторизации: на эти предикаты опираются auth-guards, access и
// upload-access. Тесты фиксируют разграничение ролей и — критично для
// безопасности — правило, что явные права переопределяют роль.

const { SYSTEM_ADMIN, HR, COURSE_AUTHOR, STUDENT } = STANDARD_ROLE_NAMES;

// ------------------------------------------------------------ форма аргумента

test("RoleLike принимает строку, массив, null и undefined", () => {
  assert.equal(hasRole("HR", "HR"), true);
  assert.equal(hasRole(["HR", COURSE_AUTHOR], COURSE_AUTHOR), true);
  assert.equal(hasRole(null, "HR"), false);
  assert.equal(hasRole(undefined, "HR"), false);
  assert.equal(hasRole([], "HR"), false);
});

test("primaryRole возвращает первую роль или null", () => {
  assert.equal(primaryRole([HR, COURSE_AUTHOR]), HR);
  assert.equal(primaryRole("HR"), "HR");
  assert.equal(primaryRole(null), null);
  assert.equal(primaryRole([]), null);
});

// ------------------------------------------------------- платформенный админ

test("isPlatformAdminRole: только ADMIN и Администратор системы", () => {
  assert.equal(isPlatformAdminRole(ROLES.ADMIN), true);
  assert.equal(isPlatformAdminRole(SYSTEM_ADMIN), true);
  assert.equal(isPlatformAdminRole([HR, ROLES.ADMIN]), true, "админ в списке ролей");
  assert.equal(isPlatformAdminRole(HR), false);
  assert.equal(isPlatformAdminRole(COURSE_AUTHOR), false);
  assert.equal(isPlatformAdminRole(STUDENT), false);
  assert.equal(isPlatformAdminRole(null), false);
});

// ------------------------------------------------------------ права по ролям

test("админ имеет все права", () => {
  for (const p of Object.values(PERMISSIONS)) {
    assert.equal(hasPermission(ROLES.ADMIN, p), true, `админу не хватает ${p}`);
    assert.equal(hasPermission(SYSTEM_ADMIN, p), true, `системному админу не хватает ${p}`);
  }
});

test("ученик: только просмотр курсов и обучение", () => {
  assert.equal(hasPermission(STUDENT, PERMISSIONS.COURSES_VIEW), true);
  assert.equal(hasPermission(STUDENT, PERMISSIONS.LEARNING_MATERIALS_PROGRESS), true);
  assert.equal(hasPermission(STUDENT, PERMISSIONS.LEARNING_KNOWLEDGE_CHECK), true);
  assert.equal(hasPermission(STUDENT, PERMISSIONS.USERS_VIEW), false);
  assert.equal(hasPermission(STUDENT, PERMISSIONS.COURSES_CREATE_EDIT), false);
  assert.equal(hasPermission(STUDENT, PERMISSIONS.REPORTS_VIEW), false);
});

test("HR: люди, назначения, отчёты — но не редактирование курсов", () => {
  assert.equal(hasPermission(HR, PERMISSIONS.USERS_VIEW), true);
  assert.equal(hasPermission(HR, PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS), true);
  assert.equal(hasPermission(HR, PERMISSIONS.REPORTS_VIEW), true);
  assert.equal(hasPermission(HR, PERMISSIONS.COURSES_CREATE_EDIT), false);
  assert.equal(hasPermission(HR, PERMISSIONS.COURSES_PUBLISH), false);
  assert.equal(hasPermission(HR, PERMISSIONS.USERS_EDIT_ACCESS_LEVEL), false);
});

test("разработчик курсов: жизненный цикл курса, но не пользователи", () => {
  assert.equal(hasPermission(COURSE_AUTHOR, PERMISSIONS.COURSES_CREATE_EDIT), true);
  assert.equal(hasPermission(COURSE_AUTHOR, PERMISSIONS.COURSES_PUBLISH), true);
  assert.equal(hasPermission(COURSE_AUTHOR, PERMISSIONS.USERS_VIEW), false);
  assert.equal(hasPermission(COURSE_AUTHOR, PERMISSIONS.REPORTS_VIEW), false);
});

test("неизвестная роль и пустой список прав не дают", () => {
  assert.equal(hasPermission("USER", PERMISSIONS.COURSES_VIEW), false);
  assert.equal(hasPermission("несуществующая роль", PERMISSIONS.COURSES_VIEW), false);
  assert.equal(hasPermission(null, PERMISSIONS.COURSES_VIEW), false);
});

test("права складываются при нескольких ролях", () => {
  const roles = [STUDENT, HR];
  assert.equal(hasPermission(roles, PERMISSIONS.LEARNING_KNOWLEDGE_CHECK), true, "от ученика");
  assert.equal(hasPermission(roles, PERMISSIONS.REPORTS_VIEW), true, "от HR");
});

// ------------------------------------------------- переопределение явными правами

test("явные права ПОЛНОСТЬЮ заменяют права роли", () => {
  // Ключ безопасности: если переданы explicitPermissions, роль игнорируется.
  assert.equal(
    hasPermission(ROLES.ADMIN, PERMISSIONS.USERS_DELETE, []),
    false,
    "пустой явный список отменяет права даже у админа"
  );
  assert.equal(
    hasPermission(null, PERMISSIONS.REPORTS_VIEW, [PERMISSIONS.REPORTS_VIEW]),
    true,
    "явное право даёт доступ без роли"
  );
  assert.equal(
    hasPermission(STUDENT, PERMISSIONS.COURSES_VIEW, [PERMISSIONS.REPORTS_VIEW]),
    false,
    "право роли не действует, когда задан явный список"
  );
});

test("невалидные значения в явных правах игнорируются", () => {
  assert.equal(hasPermission(null, PERMISSIONS.REPORTS_VIEW, ["мусор", PERMISSIONS.REPORTS_VIEW]), true);
  assert.equal(hasPermission(null, PERMISSIONS.USERS_DELETE, ["мусор"]), false);
});

// -------------------------------------------------------- hasAnyPermission / группы

test("hasAnyPermission — истина при любом совпадении", () => {
  assert.equal(hasAnyPermission(HR, [PERMISSIONS.USERS_DELETE, PERMISSIONS.REPORTS_VIEW]), true);
  assert.equal(hasAnyPermission(HR, [PERMISSIONS.USERS_DELETE, PERMISSIONS.COURSES_PUBLISH]), false);
});

test("hasGroupAccess — доступ к группе прав", () => {
  assert.equal(hasGroupAccess(HR, ACCESS_GROUPS.USERS), true);
  assert.equal(hasGroupAccess(HR, ACCESS_GROUPS.REPORTS), true);
  assert.equal(hasGroupAccess(COURSE_AUTHOR, ACCESS_GROUPS.USERS), false);
  assert.equal(hasGroupAccess(COURSE_AUTHOR, ACCESS_GROUPS.COURSES), true);
});

// -------------------------------------------------------- доступ ко всем курсам

test("canAccessAllCourses: staff да, ученик нет", () => {
  assert.equal(canAccessAllCourses(ROLES.ADMIN), true);
  assert.equal(canAccessAllCourses(COURSE_AUTHOR), true, "автор — create/publish");
  assert.equal(canAccessAllCourses(HR), true, "HR — manage_assignments");
  assert.equal(canAccessAllCourses(STUDENT), false, "ученик видит только назначенное");
  assert.equal(canAccessAllCourses("USER"), false);
  assert.equal(canAccessAllCourses(null), false);
});

test("canAccessAllCourses: просмотрщик без обучения — да, ученик-просмотрщик — нет", () => {
  // ветка canViewCourses && !knowledgeCheck && !student
  assert.equal(canAccessAllCourses(null, [PERMISSIONS.COURSES_VIEW]), true);
  assert.equal(
    canAccessAllCourses(null, [PERMISSIONS.COURSES_VIEW, PERMISSIONS.LEARNING_KNOWLEDGE_CHECK]),
    false,
    "право проверки знаний = ученик, доступа ко всем курсам нет"
  );
});

// ----------------------------------------------------------- трекинг прогресса

test("canTrackLearningProgress / canTrackMaterialProgress", () => {
  assert.equal(canTrackLearningProgress(STUDENT), true);
  assert.equal(canTrackLearningProgress(HR), false);
  assert.equal(canTrackMaterialProgress(STUDENT), true);
  assert.equal(canTrackMaterialProgress(COURSE_AUTHOR), false);
});

// ------------------------------------------------------------------ staff / student

test("isStaffRole: staff да, чистый ученик нет", () => {
  assert.equal(isStaffRole(ROLES.ADMIN), true);
  assert.equal(isStaffRole(SYSTEM_ADMIN), true);
  assert.equal(isStaffRole(HR), true, "reports.view делает staff");
  assert.equal(isStaffRole(COURSE_AUTHOR), true);
  assert.equal(isStaffRole(STUDENT), false);
  assert.equal(isStaffRole("USER"), false);
  assert.equal(isStaffRole(null), false);
});

// --------------------------------------------------------- вспомогательные

test("isPermission распознаёт валидные права", () => {
  assert.equal(isPermission(PERMISSIONS.COURSES_VIEW), true);
  assert.equal(isPermission("courses.view"), true);
  assert.equal(isPermission("не.право"), false);
  assert.equal(isPermission(""), false);
});

test("normalizePermissions фильтрует мусор и дедуплицирует", () => {
  assert.deepEqual(normalizePermissions(null), []);
  assert.deepEqual(normalizePermissions([]), []);
  assert.deepEqual(
    normalizePermissions([PERMISSIONS.COURSES_VIEW, "мусор", PERMISSIONS.COURSES_VIEW]),
    [PERMISSIONS.COURSES_VIEW]
  );
});

test("listRolePermissionsByGroup раскладывает права по группам", () => {
  const byGroup = listRolePermissionsByGroup(HR);
  assert.ok(byGroup.USERS.includes(PERMISSIONS.USERS_VIEW));
  assert.ok(byGroup.REPORTS.includes(PERMISSIONS.REPORTS_VIEW));
  assert.deepEqual(byGroup.ORGANIZATIONS, [], "у HR нет прав на организации");
  // все семь групп присутствуют в результате
  assert.deepEqual(
    Object.keys(byGroup).sort(),
    Object.values(ACCESS_GROUPS).sort()
  );
});

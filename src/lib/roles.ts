export const ROLES = {
  ADMIN: "ADMIN",
  STUDENT: "Ученик",
  USER: "USER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const STANDARD_ROLE_NAMES = {
  SYSTEM_ADMIN: "Администратор системы",
  STUDENT: "Ученик",
  HR: "HR",
  COURSE_AUTHOR: "Разработчик курсов",
} as const;

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "администратор",
  USER: "сотрудник",
  [STANDARD_ROLE_NAMES.SYSTEM_ADMIN]: "Администратор системы",
  [STANDARD_ROLE_NAMES.STUDENT]: "Ученик",
  [STANDARD_ROLE_NAMES.HR]: "HR-менеджер",
  [STANDARD_ROLE_NAMES.COURSE_AUTHOR]: "Разработчик курсов",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Полный доступ ко всем разделам и административным действиям.",
  USER: "Базовый доступ сотрудника к обучению и проверке знаний.",
  [STANDARD_ROLE_NAMES.SYSTEM_ADMIN]:
    "Администрирование пользователей, ролей, подразделений, организаций, групп, курсов и отчетов.",
  [STANDARD_ROLE_NAMES.STUDENT]: "Прохождение назначенных курсов и проверка знаний.",
  [STANDARD_ROLE_NAMES.HR]:
    "Управление учениками, назначениями на курсы и HR-отчетами без доступа к системному администрированию.",
  [STANDARD_ROLE_NAMES.COURSE_AUTHOR]:
    "Создание, редактирование и публикация курсов, управление назначениями обучения.",
};

export const ACCESS_GROUPS = {
  USERS: "USERS",
  GROUPS: "GROUPS",
  DEPARTMENTS: "DEPARTMENTS",
  ORGANIZATIONS: "ORGANIZATIONS",
  COURSES: "COURSES",
  REPORTS: "REPORTS",
  LEARNING_MANAGEMENT: "LEARNING_MANAGEMENT",
} as const;

export type AccessGroup = (typeof ACCESS_GROUPS)[keyof typeof ACCESS_GROUPS];

export const ACCESS_GROUP_LABELS: Record<AccessGroup, string> = {
  USERS: "Пользователи",
  GROUPS: "Группы",
  DEPARTMENTS: "Подразделения",
  ORGANIZATIONS: "Организации",
  COURSES: "Курсы",
  REPORTS: "Отчеты",
  LEARNING_MANAGEMENT: "Управление обучением",
};

export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_EDIT_PROFILE: "users.edit_profile",
  USERS_EDIT_ACCESS_LEVEL: "users.edit_access_level",
  USERS_DELETE: "users.delete",
  GROUPS_VIEW: "groups.view",
  GROUPS_CREATE: "groups.create",
  GROUPS_EDIT: "groups.edit",
  GROUPS_DELETE: "groups.delete",
  DEPARTMENTS_VIEW: "departments.view",
  DEPARTMENTS_CREATE_EDIT: "departments.create_edit",
  DEPARTMENTS_DELETE: "departments.delete",
  ORGANIZATIONS_VIEW: "organizations.view",
  ORGANIZATIONS_CREATE_EDIT: "organizations.create_edit",
  ORGANIZATIONS_DELETE: "organizations.delete",
  COURSES_VIEW: "courses.view",
  COURSES_CREATE_EDIT: "courses.create_edit",
  COURSES_PUBLISH: "courses.publish",
  COURSES_DELETE: "courses.delete",
  COURSES_MANAGE_ASSIGNMENTS: "courses.manage_assignments",
  REPORTS_VIEW: "reports.view",
  LEARNING_MATERIALS_PROGRESS: "learning.materials_progress",
  LEARNING_KNOWLEDGE_CHECK: "learning.knowledge_check",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type RoleLike = string | string[] | null | undefined;
const PERMISSION_VALUES = Object.values(PERMISSIONS);

type PermissionDefinition = {
  key: Permission;
  label: string;
  group: AccessGroup;
};

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: PERMISSIONS.USERS_VIEW, label: "Просмотр пользователей", group: ACCESS_GROUPS.USERS },
  { key: PERMISSIONS.USERS_CREATE, label: "Создание пользователей", group: ACCESS_GROUPS.USERS },
  {
    key: PERMISSIONS.USERS_EDIT_PROFILE,
    label: "Изменение персональной информации о пользователе",
    group: ACCESS_GROUPS.USERS,
  },
  {
    key: PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    label: "Изменение уровня доступа пользователя",
    group: ACCESS_GROUPS.USERS,
  },
  { key: PERMISSIONS.USERS_DELETE, label: "Удаление пользователя", group: ACCESS_GROUPS.USERS },
  { key: PERMISSIONS.GROUPS_VIEW, label: "Просмотр группы", group: ACCESS_GROUPS.GROUPS },
  { key: PERMISSIONS.GROUPS_CREATE, label: "Создание групп", group: ACCESS_GROUPS.GROUPS },
  { key: PERMISSIONS.GROUPS_EDIT, label: "Редактирование групп", group: ACCESS_GROUPS.GROUPS },
  { key: PERMISSIONS.GROUPS_DELETE, label: "Удаление групп", group: ACCESS_GROUPS.GROUPS },
  {
    key: PERMISSIONS.DEPARTMENTS_VIEW,
    label: "Просмотр подразделений",
    group: ACCESS_GROUPS.DEPARTMENTS,
  },
  {
    key: PERMISSIONS.DEPARTMENTS_CREATE_EDIT,
    label: "Создание и редактирование подразделений",
    group: ACCESS_GROUPS.DEPARTMENTS,
  },
  {
    key: PERMISSIONS.DEPARTMENTS_DELETE,
    label: "Удаление подразделений",
    group: ACCESS_GROUPS.DEPARTMENTS,
  },
  {
    key: PERMISSIONS.ORGANIZATIONS_VIEW,
    label: "Просмотр организаций",
    group: ACCESS_GROUPS.ORGANIZATIONS,
  },
  {
    key: PERMISSIONS.ORGANIZATIONS_CREATE_EDIT,
    label: "Создание и редактирование организаций",
    group: ACCESS_GROUPS.ORGANIZATIONS,
  },
  {
    key: PERMISSIONS.ORGANIZATIONS_DELETE,
    label: "Удаление организаций",
    group: ACCESS_GROUPS.ORGANIZATIONS,
  },
  { key: PERMISSIONS.COURSES_VIEW, label: "Просмотр курсов", group: ACCESS_GROUPS.COURSES },
  {
    key: PERMISSIONS.COURSES_CREATE_EDIT,
    label: "Создание и редактирование курсов",
    group: ACCESS_GROUPS.COURSES,
  },
  {
    key: PERMISSIONS.COURSES_PUBLISH,
    label: "Публикация курсов",
    group: ACCESS_GROUPS.COURSES,
  },
  { key: PERMISSIONS.COURSES_DELETE, label: "Удаление курсов", group: ACCESS_GROUPS.COURSES },
  {
    key: PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    label: "Управление назначениями",
    group: ACCESS_GROUPS.COURSES,
  },
  {
    key: PERMISSIONS.REPORTS_VIEW,
    label: "Просмотр отчетов по курсам и пользователям",
    group: ACCESS_GROUPS.REPORTS,
  },
  {
    key: PERMISSIONS.LEARNING_MATERIALS_PROGRESS,
    label: "Просмотр материалов и прогресс обучения",
    group: ACCESS_GROUPS.LEARNING_MANAGEMENT,
  },
  {
    key: PERMISSIONS.LEARNING_KNOWLEDGE_CHECK,
    label: "Прохождение тестов",
    group: ACCESS_GROUPS.LEARNING_MANAGEMENT,
  },
];

export const GROUP_PERMISSIONS: Record<AccessGroup, Permission[]> = {
  USERS: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT_PROFILE,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    PERMISSIONS.USERS_DELETE,
  ],
  GROUPS: [
    PERMISSIONS.GROUPS_VIEW,
    PERMISSIONS.GROUPS_CREATE,
    PERMISSIONS.GROUPS_EDIT,
    PERMISSIONS.GROUPS_DELETE,
  ],
  DEPARTMENTS: [
    PERMISSIONS.DEPARTMENTS_VIEW,
    PERMISSIONS.DEPARTMENTS_CREATE_EDIT,
    PERMISSIONS.DEPARTMENTS_DELETE,
  ],
  ORGANIZATIONS: [
    PERMISSIONS.ORGANIZATIONS_VIEW,
    PERMISSIONS.ORGANIZATIONS_CREATE_EDIT,
    PERMISSIONS.ORGANIZATIONS_DELETE,
  ],
  COURSES: [
    PERMISSIONS.COURSES_VIEW,
    PERMISSIONS.COURSES_CREATE_EDIT,
    PERMISSIONS.COURSES_PUBLISH,
    PERMISSIONS.COURSES_DELETE,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
  ],
  REPORTS: [PERMISSIONS.REPORTS_VIEW],
  LEARNING_MANAGEMENT: [
    PERMISSIONS.LEARNING_MATERIALS_PROGRESS,
    PERMISSIONS.LEARNING_KNOWLEDGE_CHECK,
  ],
};

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.STUDENT]: [
    PERMISSIONS.COURSES_VIEW,
    PERMISSIONS.LEARNING_MATERIALS_PROGRESS,
    PERMISSIONS.LEARNING_KNOWLEDGE_CHECK,
  ],
  [STANDARD_ROLE_NAMES.SYSTEM_ADMIN]: Object.values(PERMISSIONS),
  [STANDARD_ROLE_NAMES.HR]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_EDIT_PROFILE,
    PERMISSIONS.GROUPS_VIEW,
    PERMISSIONS.GROUPS_CREATE,
    PERMISSIONS.GROUPS_EDIT,
    PERMISSIONS.COURSES_VIEW,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    PERMISSIONS.REPORTS_VIEW,
  ],
  [STANDARD_ROLE_NAMES.COURSE_AUTHOR]: [
    PERMISSIONS.COURSES_VIEW,
    PERMISSIONS.COURSES_CREATE_EDIT,
    PERMISSIONS.COURSES_PUBLISH,
    PERMISSIONS.COURSES_DELETE,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
  ],
};

export function isPermission(value: string): value is Permission {
  return PERMISSION_VALUES.includes(value as Permission);
}

export function normalizePermissions(values: string[] | null | undefined): Permission[] {
  if (!values?.length) return [];
  return [...new Set(values.filter((value) => isPermission(value)))];
}

function toRoleList(role: RoleLike) {
  if (Array.isArray(role)) return role.filter(Boolean);
  if (!role) return [];
  return [role];
}

export function primaryRole(role: RoleLike) {
  return toRoleList(role)[0] ?? null;
}

function rolePermissionSet(role: RoleLike, explicitPermissions?: string[] | null) {
  if (explicitPermissions) return new Set<Permission>(normalizePermissions(explicitPermissions));
  return new Set<Permission>(toRoleList(role).flatMap((item) => ROLE_PERMISSIONS[item] ?? []));
}

export function hasPermission(
  role: RoleLike,
  permission: Permission,
  explicitPermissions?: string[] | null
) {
  return rolePermissionSet(role, explicitPermissions).has(permission);
}

export function hasAnyPermission(
  role: RoleLike,
  permissions: Permission[],
  explicitPermissions?: string[] | null
) {
  const set = rolePermissionSet(role, explicitPermissions);
  return permissions.some((permission) => set.has(permission));
}

export function hasGroupAccess(
  role: RoleLike,
  group: AccessGroup,
  explicitPermissions?: string[] | null
) {
  const set = rolePermissionSet(role, explicitPermissions);
  return GROUP_PERMISSIONS[group].some((permission) => set.has(permission));
}

export function hasRole(role: RoleLike, targetRole: string) {
  return toRoleList(role).includes(targetRole);
}

export function isPlatformAdminRole(role: RoleLike) {
  return hasRole(role, ROLES.ADMIN) || hasRole(role, STANDARD_ROLE_NAMES.SYSTEM_ADMIN);
}

export function canAccessAllCourses(role: RoleLike, explicitPermissions?: string[] | null) {
  if (isPlatformAdminRole(role)) return true;

  const isStudentRole = hasRole(role, STANDARD_ROLE_NAMES.STUDENT) || hasRole(role, ROLES.STUDENT);
  const canViewCourses = hasPermission(role, PERMISSIONS.COURSES_VIEW, explicitPermissions);
  const canCreateCourses = hasPermission(
    role,
    PERMISSIONS.COURSES_CREATE_EDIT,
    explicitPermissions
  );
  const canPublishCourses = hasPermission(role, PERMISSIONS.COURSES_PUBLISH, explicitPermissions);
  const canManageAssignments = hasPermission(
    role,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    explicitPermissions
  );
  const canTakeKnowledgeCheck = hasPermission(
    role,
    PERMISSIONS.LEARNING_KNOWLEDGE_CHECK,
    explicitPermissions
  );

  return canCreateCourses || canPublishCourses || canManageAssignments || (canViewCourses && !canTakeKnowledgeCheck && !isStudentRole);
}

export function canTrackLearningProgress(role: RoleLike, explicitPermissions?: string[] | null) {
  return hasPermission(role, PERMISSIONS.LEARNING_KNOWLEDGE_CHECK, explicitPermissions);
}

export function canTrackMaterialProgress(role: RoleLike, explicitPermissions?: string[] | null) {
  return hasPermission(role, PERMISSIONS.LEARNING_MATERIALS_PROGRESS, explicitPermissions);
}

export function listRolePermissionsByGroup(role: RoleLike, explicitPermissions?: string[] | null) {
  const set = rolePermissionSet(role, explicitPermissions);
  return Object.entries(GROUP_PERMISSIONS).reduce<Record<AccessGroup, Permission[]>>(
    (acc, [group, permissions]) => {
      const key = group as AccessGroup;
      acc[key] = permissions.filter((permission) => set.has(permission));
      return acc;
    },
    {
      USERS: [],
      GROUPS: [],
      DEPARTMENTS: [],
      ORGANIZATIONS: [],
      COURSES: [],
      REPORTS: [],
      LEARNING_MANAGEMENT: [],
    }
  );
}

export function isStaffRole(role: RoleLike) {
  return hasAnyPermission(role, [
    PERMISSIONS.COURSES_CREATE_EDIT,
    PERMISSIONS.COURSES_PUBLISH,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    PERMISSIONS.REPORTS_VIEW,
  ]);
}

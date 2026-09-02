// UI-предпочтения пользователя (режим отображения курсов, предпочитаемая роль).
// Микро-use-case: нормализация/валидация + upsert через порт. Транспорт держит
// guard сессии, безопасный returnTo и revalidate/redirect.

export type AdminCoursesView = "cards" | "list" | "table";

export interface UserUiPreferenceRepository {
  upsertAdminCoursesView(userId: string, view: AdminCoursesView): Promise<void>;
  upsertPreferredRole(userId: string, role: string): Promise<void>;
}

// Нередактируемые значения нормализуются к "table" (как в исходном транспорте).
export function normalizeAdminCoursesView(value: string): AdminCoursesView {
  if (value === "cards" || value === "list") return value;
  return "table";
}

export function createManageUiPreferences(deps: { repository: UserUiPreferenceRepository }) {
  const { repository } = deps;

  return {
    async setAdminCoursesView(input: { userId: string; view: string }): Promise<void> {
      await repository.upsertAdminCoursesView(input.userId, normalizeAdminCoursesView(input.view));
    },

    async setPreferredRole(input: {
      userId: string;
      role: string;
      availableRoles: string[];
    }): Promise<void> {
      const role = input.role.trim();
      if (!role || !input.availableRoles.includes(role)) {
        throw new Error("Выбранная роль недоступна пользователю.");
      }
      await repository.upsertPreferredRole(input.userId, role);
    },
  };
}

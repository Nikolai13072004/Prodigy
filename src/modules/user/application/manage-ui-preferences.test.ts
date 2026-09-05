import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createManageUiPreferences,
  normalizeAdminCoursesView,
} from "./manage-ui-preferences";
import type { AdminCoursesView, UserUiPreferenceRepository } from "./manage-ui-preferences";

function makeRepository() {
  const state = {
    views: [] as { userId: string; view: AdminCoursesView }[],
    roles: [] as { userId: string; role: string }[],
  };
  const repository: UserUiPreferenceRepository = {
    async upsertAdminCoursesView(userId, view) {
      state.views.push({ userId, view });
    },
    async upsertPreferredRole(userId, role) {
      state.roles.push({ userId, role });
    },
  };
  return { repository, state };
}

test("normalizeAdminCoursesView: cards/list проходят, прочее → table", () => {
  assert.equal(normalizeAdminCoursesView("cards"), "cards");
  assert.equal(normalizeAdminCoursesView("list"), "list");
  assert.equal(normalizeAdminCoursesView("table"), "table");
  assert.equal(normalizeAdminCoursesView("что-то"), "table");
  assert.equal(normalizeAdminCoursesView(""), "table");
});

test("setAdminCoursesView: нормализует и сохраняет", async () => {
  const { repository, state } = makeRepository();
  const m = createManageUiPreferences({ repository });
  await m.setAdminCoursesView({ userId: "u-1", view: "cards" });
  await m.setAdminCoursesView({ userId: "u-1", view: "bogus" });
  assert.deepEqual(state.views, [
    { userId: "u-1", view: "cards" },
    { userId: "u-1", view: "table" },
  ]);
});

test("setPreferredRole: недоступная роль → ошибка, upsert не вызывается", async () => {
  const { repository, state } = makeRepository();
  const m = createManageUiPreferences({ repository });
  await assert.rejects(
    m.setPreferredRole({ userId: "u-1", role: "Админ", availableRoles: ["Ученик"] }),
    /недоступна/,
  );
  assert.equal(state.roles.length, 0);
});

test("setPreferredRole: пустая роль → ошибка", async () => {
  const { repository } = makeRepository();
  const m = createManageUiPreferences({ repository });
  await assert.rejects(
    m.setPreferredRole({ userId: "u-1", role: "   ", availableRoles: ["Ученик"] }),
    /недоступна/,
  );
});

test("setPreferredRole: доступная роль (с обрезкой пробелов) → сохраняется", async () => {
  const { repository, state } = makeRepository();
  const m = createManageUiPreferences({ repository });
  await m.setPreferredRole({ userId: "u-1", role: "  Ученик  ", availableRoles: ["Ученик", "HR"] });
  assert.deepEqual(state.roles, [{ userId: "u-1", role: "Ученик" }]);
});

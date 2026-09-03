import "server-only";

import { createManageUiPreferences } from "../application/manage-ui-preferences";
import { prismaUiPreferenceRepository } from "../infrastructure/prisma-ui-preference-repository";

export const uiPreferences = createManageUiPreferences({
  repository: prismaUiPreferenceRepository,
});

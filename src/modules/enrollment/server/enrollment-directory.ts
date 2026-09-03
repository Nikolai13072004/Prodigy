import "server-only";

import prisma from "@/lib/prisma";

// Read-фасады для транспорта назначений/доступа: держим prisma-чтения в модуле,
// чтобы actions оставались тонкими. Мутации — в соответствующих use-case'ах.

export type InviteCandidateUser = {
  id: string;
  email: string | null;
  status: string;
  roleNames: string[];
};

// Кандидаты для приглашения: все пользователи с email + их роли, уже в форме,
// которую ждёт planInviteRecipients.
export async function loadInviteCandidateUsers(): Promise<InviteCandidateUser[]> {
  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      userRoles: {
        include: { roleProfile: { select: { name: true } } },
      },
    },
  });
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    status: user.status,
    roleNames: [user.role, ...user.userRoles.map((item) => item.roleProfile.name)].filter(Boolean),
  }));
}

export type LearnerContact = {
  name: string | null;
  email: string | null;
  firstName: string | null;
};

// Контакт ученика для письма о продлении доступа (нужен до вызова use-case).
export async function loadLearnerContact(learnerId: string): Promise<LearnerContact | null> {
  const learner = await prisma.user.findUnique({
    where: { id: learnerId },
    select: { name: true, email: true, firstName: true },
  });
  return learner ?? null;
}

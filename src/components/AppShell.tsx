import { auth } from "@/auth";
import { AppShellClient } from "@/components/AppShellClient";
import { getPlatformBranding } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, branding] = await Promise.all([
    auth(),
    getPlatformBranding(),
  ]);
  const uiPreference = session?.user
    ? await prisma.userUiPreference.findUnique({
        where: { userId: session.user.id },
        select: { preferredRole: true },
      })
    : null;

  return (
    <AppShellClient
      branding={branding}
      user={
        session?.user
          ? {
              id: session.user.id,
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
              role: session.user.role ?? null,
              roles: session.user.roles ?? [],
              permissions: session.user.permissions ?? [],
              preferredRole: uiPreference?.preferredRole ?? null,
              twoFactorVerified: session.user.twoFactorVerified ?? false,
              twoFactorSetupRequired:
                session.user.twoFactorSetupRequired ?? false,
            }
          : null
      }
    >
      {children}
    </AppShellClient>
  );
}

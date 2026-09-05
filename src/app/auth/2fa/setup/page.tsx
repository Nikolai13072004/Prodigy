import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TwoFactorSetupPanel } from "@/app/auth/2fa/setup/TwoFactorSetupPanel";
import { getPlatformBranding, getPlatformSecuritySettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { isPlatformAdminRole } from "@/lib/roles";
import { buildTotpOtpAuthUrl, generateTotpSecret } from "@/lib/two-factor";

type Props = {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
};

function safeCallbackUrl(raw?: string) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function TwoFactorSetupPage({ searchParams }: Props) {
  const [session, branding, security, sp] = await Promise.all([
    auth(),
    getPlatformBranding(),
    getPlatformSecuritySettings(),
    searchParams,
  ]);

  const callbackUrl = safeCallbackUrl(sp.callbackUrl);

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  if (!isPlatformAdminRole(session.user.roles) || !security.adminTotpRequired) {
    redirect(callbackUrl);
  }

  if (!session.user.twoFactorSetupRequired) {
    redirect(callbackUrl);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      login: true,
      email: true,
      totpCredential: {
        select: { id: true },
      },
    },
  });

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const accountName = user.email?.trim() || user.login;
  const secret = user.totpCredential ? null : generateTotpSecret();
  const otpAuthUrl = secret
    ? buildTotpOtpAuthUrl({
        secret,
        accountName,
        issuer: branding.siteName,
      })
    : null;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center px-4 py-10">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--ink-muted)]">Безопасность платформы</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)]">Подключение двухфакторной аутентификации</h1>
        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          После подключения 2FA администратор будет входить в {branding.siteName} только по паролю и одноразовому коду из Google Authenticator.
        </p>
      </div>

      <TwoFactorSetupPanel
        callbackUrl={callbackUrl}
        siteName={branding.siteName}
        accountName={accountName}
        secret={secret}
        otpAuthUrl={otpAuthUrl}
        alreadyConfigured={Boolean(user.totpCredential)}
      />
    </main>
  );
}

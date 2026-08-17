import { requirePlatformAdmin } from "@/lib/auth-guards";
import { checkSmtpConnectionFromForm } from "@/lib/email/smtp-connection-check";
import { saveEmailPlatformSettingsFromForm } from "@/lib/platform-email-settings-save";

function redirectToEmailSettings(params: {
  saved?: string;
  error?: string;
  connectionStatus?: "success" | "error";
  connectionMessage?: string;
}) {
  const searchParams = new URLSearchParams({ tab: "email" });

  if (params.saved) {
    searchParams.set("saved", params.saved);
  }

  if (params.error) {
    searchParams.set("error", params.error);
  }

  if (params.connectionStatus) {
    searchParams.set("connectionStatus", params.connectionStatus);
  }

  if (params.connectionMessage) {
    searchParams.set("connectionMessage", params.connectionMessage);
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `/admin/settings?${searchParams.toString()}`,
    },
  });
}

export async function POST(request: Request) {
  const session = await requirePlatformAdmin();
  let intent = "save";

  try {
    const formData = await request.formData();
    intent = String(formData.get("intent") ?? "save");

    if (intent === "checkConnection") {
      const result = await checkSmtpConnectionFromForm(formData);
      return redirectToEmailSettings({
        connectionStatus: "success",
        connectionMessage: `SMTP-подключение подтверждено: ${result.host}:${result.port}, ${result.authType === "oauth2" ? "OAuth2" : "пароль"}.`,
      });
    }

    await saveEmailPlatformSettingsFromForm(formData, {
      id: session.user.id,
      login: session.user.email,
      name: session.user.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить email-настройки.";
    if (intent === "checkConnection") {
      return redirectToEmailSettings({ connectionStatus: "error", connectionMessage: message });
    }
    return redirectToEmailSettings({ error: message });
  }

  return redirectToEmailSettings({ saved: "email" });
}

import { formatHoursLabel } from "@/lib/email/template-format";
import {
  DEFAULT_PLATFORM_EMAIL_TEMPLATES,
  renderPlatformHtmlEmailTemplate,
  type PlatformHtmlEmailTemplate,
} from "@/lib/email/template-settings";

type UserActivationTemplateInput = {
  userName?: string | null;
  firstName?: string | null;
  login: string;
  activationUrl: string;
  linkTtlHours: number;
  templateCopy?: PlatformHtmlEmailTemplate;
};

export function buildUserActivationEmailTemplate(input: UserActivationTemplateInput) {
  const templateCopy = input.templateCopy ?? DEFAULT_PLATFORM_EMAIL_TEMPLATES.welcome;
  const fullName = input.userName?.trim() || "Пользователь";
  const firstName = input.firstName?.trim() || fullName.split(/\s+/)[0] || fullName;
  const template = renderPlatformHtmlEmailTemplate(templateCopy, {
    accessUrl: input.activationUrl,
    activationUrl: input.activationUrl,
    linkTtlHours: String(input.linkTtlHours),
    linkTtlHoursLabel: formatHoursLabel(input.linkTtlHours),
    login: input.login,
    loginUrl: "",
    passwordInstruction: "задайте пароль на странице активации",
    temporaryPassword: "",
    firstName,
    fullName,
    userName: firstName,
  });

  return {
    ...template,
    html: template.html.replaceAll(`>${input.activationUrl}</a>`, ">Активировать аккаунт</a>"),
  };
}

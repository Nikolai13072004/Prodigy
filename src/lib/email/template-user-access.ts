import {
  DEFAULT_PLATFORM_EMAIL_TEMPLATES,
  renderPlatformHtmlEmailTemplate,
  type PlatformHtmlEmailTemplate,
} from "@/lib/email/template-settings";

type UserAccessTemplateInput = {
  userName?: string | null;
  firstName?: string | null;
  login: string;
  temporaryPassword: string;
  loginUrl: string;
  reason: "ACCOUNT_CREATED" | "PASSWORD_RESET";
  templateCopy?: PlatformHtmlEmailTemplate;
};

export function buildUserAccessEmailTemplate(input: UserAccessTemplateInput) {
  const isCreated = input.reason === "ACCOUNT_CREATED";
  const fullName = input.userName?.trim() || "Пользователь";
  const firstName = input.firstName?.trim() || fullName.split(/\s+/)[0] || fullName;
  const templateCopy =
    input.templateCopy ??
    (isCreated ? DEFAULT_PLATFORM_EMAIL_TEMPLATES.welcome : DEFAULT_PLATFORM_EMAIL_TEMPLATES.passwordReset);

  return renderPlatformHtmlEmailTemplate(templateCopy, {
    accessUrl: input.loginUrl,
    activationUrl: "",
    login: input.login,
    loginUrl: input.loginUrl,
    passwordInstruction: input.temporaryPassword,
    temporaryPassword: input.temporaryPassword,
    firstName,
    fullName,
    userName: firstName,
  });
}

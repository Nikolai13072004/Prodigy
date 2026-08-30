import {
  DEFAULT_PLATFORM_EMAIL_TEMPLATES,
  renderPlatformHtmlEmailTemplate,
  type PlatformHtmlEmailTemplate,
} from "@/lib/email/template-settings";

type StudentInviteTemplateInput = {
  studentName?: string | null;
  firstName?: string | null;
  login: string;
  temporaryPassword: string;
  loginUrl: string;
  templateCopy?: PlatformHtmlEmailTemplate;
};

export function buildStudentInviteEmailTemplate(input: StudentInviteTemplateInput) {
  const templateCopy = input.templateCopy ?? DEFAULT_PLATFORM_EMAIL_TEMPLATES.welcome;
  const fullName = input.studentName?.trim() || "Пользователь";
  const firstName = input.firstName?.trim() || fullName.split(/\s+/)[0] || fullName;

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

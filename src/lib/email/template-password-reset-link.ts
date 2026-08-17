import {
  buildPlainTextEmailFromRichHtml,
  buildPlatformHtmlEmailFromRichHtml,
  renderPlatformHtmlEmailTemplate,
  type PlatformHtmlEmailTemplate,
} from "@/lib/email/template-settings";

type PasswordResetLinkTemplateInput = {
  userName?: string | null;
  firstName?: string | null;
  login: string;
  resetUrl: string;
  linkTtlLabel: string;
  templateCopy?: PlatformHtmlEmailTemplate;
};

const DEFAULT_PASSWORD_RESET_LINK_EMAIL_EDITOR_HTML =
  "<p>Здравствуйте, {{firstName}}!</p>" +
  "<h2>Вы запросили сброс пароля.</h2>" +
  "<p><strong>Логин:</strong> {{login}}</p>" +
  "<p>Чтобы задать новый пароль, перейдите по ссылке:<br>{{resetUrl}}</p>" +
  "<p>Ссылка действует {{linkTtlLabel}}.</p>" +
  "<p>Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>";

const DEFAULT_PASSWORD_RESET_LINK_EMAIL_TEMPLATE = {
  subject: "Сброс пароля",
  editorHtml: DEFAULT_PASSWORD_RESET_LINK_EMAIL_EDITOR_HTML,
  html: buildPlatformHtmlEmailFromRichHtml(DEFAULT_PASSWORD_RESET_LINK_EMAIL_EDITOR_HTML),
  text: buildPlainTextEmailFromRichHtml(DEFAULT_PASSWORD_RESET_LINK_EMAIL_EDITOR_HTML),
} as const satisfies PlatformHtmlEmailTemplate;

export function buildPasswordResetLinkEmailTemplate(input: PasswordResetLinkTemplateInput) {
  const fullName = input.userName?.trim() || "Пользователь";
  const firstName = input.firstName?.trim() || fullName.split(/\s+/)[0] || fullName;

  return renderPlatformHtmlEmailTemplate(
    input.templateCopy ?? DEFAULT_PASSWORD_RESET_LINK_EMAIL_TEMPLATE,
    {
      firstName,
      fullName,
      linkTtlLabel: input.linkTtlLabel,
      login: input.login,
      resetUrl: input.resetUrl,
      userName: firstName,
    },
  );
}

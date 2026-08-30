export type GeneralPlatformSettingsFormValues = {
  siteName: string;
  siteDescription: string;
  supportEmail: string;
  feedbackEnabled: boolean;
  feedbackModerationEnabled: boolean;
  logoUrl: string;
  faviconUrl: string;
  timeZone: string;
  dateFormat: string;
  timeFormat: string;
};

export type GeneralPlatformSettingsFormState = {
  error: string | null;
  values: GeneralPlatformSettingsFormValues | null;
};

export const INITIAL_GENERAL_PLATFORM_SETTINGS_FORM_STATE: GeneralPlatformSettingsFormState = {
  error: null,
  values: null,
};

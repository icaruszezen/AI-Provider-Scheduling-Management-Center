import i18n from '@/i18n';

/**
 * Machine-readable Management API error codes that deserve a localized message.
 *
 * Without this, any call site that has not been individually taught about a code
 * shows the backend's raw English detail, which is both untranslated and phrased
 * for operators rather than for the person clicking a button.
 */
const API_CODE_MESSAGE_KEYS: Record<string, string> = {
  slave_node_readonly: 'cluster.readonly',
};

export const localizeApiErrorMessage = (apiCode: string | undefined, fallback: string): string => {
  if (!apiCode) return fallback;
  const key = API_CODE_MESSAGE_KEYS[apiCode];
  if (!key) return fallback;
  const translated = i18n.t(key);
  return translated && translated !== key ? translated : fallback;
};

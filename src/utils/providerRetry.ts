export const MAX_PROVIDER_RETRY_COUNT = 10;
export const DEFAULT_PROVIDER_RETRY_STATUS_CODES = [401, 403, 429];

export const normalizeProviderRetryCount = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.min(MAX_PROVIDER_RETRY_COUNT, Math.floor(parsed));
};

export const normalizeProviderRetryStatusCodes = (value: unknown): number[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const seen = new Set<number>();
  const out: number[] = [];
  value.forEach((item) => {
    const parsed = typeof item === 'number' ? item : Number(item);
    if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599 || seen.has(parsed)) {
      return;
    }
    seen.add(parsed);
    out.push(parsed);
  });
  out.sort((left, right) => left - right);
  return out;
};

export const parseProviderRetryStatusCodesInput = (input: string): number[] =>
  normalizeProviderRetryStatusCodes(
    input
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  ) ?? [];

/**
 * Reports whether every token in the status-code input is a usable HTTP status
 * code. Parsing drops anything out of range, so without this check a typo would
 * be discarded silently on save.
 */
export const providerRetryStatusCodesInputIsValid = (input: string): boolean =>
  input
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => {
      const parsed = Number(part);
      return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599;
    });

export const formatProviderRetryStatusCodes = (codes?: number[] | null): string =>
  codes?.length ? codes.join(', ') : '';

export const providerRetryCountFromInput = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return normalizeProviderRetryCount(trimmed);
};

/**
 * Maps the two retry inputs of a provider form to the config fields.
 *
 * An empty input means the user wants the credential back on the global
 * default, so it maps to `null` (clear the override) rather than to `undefined`
 * (leave whatever is stored), which would make clearing the box a no-op.
 */
export const providerRetryFieldsFromForm = (input: {
  providerRetryCount?: number;
  providerRetryStatusCodesText?: string;
}): { providerRetryCount: number | null; providerRetryStatusCodes: number[] | null } => {
  const codes = parseProviderRetryStatusCodesInput(input.providerRetryStatusCodesText ?? '');
  return {
    providerRetryCount: normalizeProviderRetryCount(input.providerRetryCount) ?? null,
    providerRetryStatusCodes: codes.length ? codes : null,
  };
};

/**
 * Writes the same-credential retry fields onto an outgoing provider payload.
 *
 * The three states are distinct on the wire: `undefined` omits the field and
 * leaves the stored value alone, `null` clears the override so the credential
 * falls back to the global default, and a value (including an empty status-code
 * array) is sent verbatim.
 */
export const applyProviderRetryPayload = (
  payload: Record<string, unknown>,
  config: {
    providerRetryCount?: number | null;
    providerRetryStatusCodes?: number[] | null;
  }
) => {
  if (config.providerRetryCount === null) {
    payload['provider-retry-count'] = null;
  } else {
    const count = normalizeProviderRetryCount(config.providerRetryCount);
    if (count !== undefined) {
      payload['provider-retry-count'] = count;
    }
  }
  if (config.providerRetryStatusCodes === null) {
    payload['provider-retry-status-codes'] = null;
  } else if (config.providerRetryStatusCodes !== undefined) {
    payload['provider-retry-status-codes'] = config.providerRetryStatusCodes;
  }
};

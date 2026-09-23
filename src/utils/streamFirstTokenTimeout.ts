export const MAX_STREAM_FIRST_TOKEN_TIMEOUT_SECONDS = 3600;

export const normalizeStreamFirstTokenTimeout = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.min(MAX_STREAM_FIRST_TOKEN_TIMEOUT_SECONDS, Math.floor(parsed));
};

export const streamFirstTokenTimeoutFromForm = (value: number | undefined): number | null =>
  normalizeStreamFirstTokenTimeout(value) ?? null;

export const applyStreamFirstTokenTimeoutPayload = (
  payload: Record<string, unknown>,
  config: { streamFirstTokenTimeoutSeconds?: number | null }
) => {
  if (config.streamFirstTokenTimeoutSeconds === null) {
    payload['stream-first-token-timeout-seconds'] = null;
    return;
  }
  const seconds = normalizeStreamFirstTokenTimeout(config.streamFirstTokenTimeoutSeconds);
  if (seconds !== undefined) {
    payload['stream-first-token-timeout-seconds'] = seconds;
  }
};

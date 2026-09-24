export const MAX_CONCURRENT_CONNECTIONS = 1_000_000;

export const normalizeMaxConcurrentConnections = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.min(MAX_CONCURRENT_CONNECTIONS, Math.floor(parsed));
};

export const maxConcurrentConnectionsForForm = (
  value: number | null | undefined
): number | undefined => {
  const normalized = normalizeMaxConcurrentConnections(value);
  if (normalized === undefined || normalized <= 0) {
    return undefined;
  }
  return normalized;
};

export const maxConcurrentConnectionsFromForm = (value: number | undefined): number | null =>
  normalizeMaxConcurrentConnections(value) ?? null;

export const applyMaxConcurrentConnectionsPayload = (
  payload: Record<string, unknown>,
  config: { maxConcurrentConnections?: number | null }
) => {
  if (config.maxConcurrentConnections === null) {
    payload['max-concurrent-connections'] = null;
    return;
  }
  const limit = normalizeMaxConcurrentConnections(config.maxConcurrentConnections);
  if (limit !== undefined) {
    payload['max-concurrent-connections'] = limit;
  }
};

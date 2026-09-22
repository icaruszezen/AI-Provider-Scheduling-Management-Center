import type { ChannelGroupSettings } from '@/types/config';

export const MAX_CHANNEL_RETRY_COUNT = 100;

export type { ChannelGroupSettings };

export const emptyChannelGroup = (name: string): ChannelGroupSettings => ({
  name,
  apiKeys: [],
  channelRetryStatusCodes: [],
  channelRetryErrorContains: [],
});

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((item) => {
    const trimmed = String(item ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  });
  return out;
};

const numberList = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  value.forEach((item) => {
    const parsed = typeof item === 'number' ? item : Number(String(item ?? '').trim());
    if (!Number.isInteger(parsed) || seen.has(parsed)) return;
    seen.add(parsed);
    out.push(parsed);
  });
  return out;
};

const optionalCount = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed)) return undefined;
  return parsed;
};

export const parseChannelGroupEntry = (item: unknown): ChannelGroupSettings | null => {
  if (typeof item === 'string') {
    const name = item.trim();
    return name ? emptyChannelGroup(name) : null;
  }
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const name = String(record.name ?? '').trim();
  if (!name) return null;
  return {
    name,
    apiKeys: stringList(record['api-keys']),
    channelRetryCount: optionalCount(record['channel-retry-count']),
    channelRetryStatusCodes: numberList(record['channel-retry-status-codes']),
    channelRetryErrorContains: stringList(record['channel-retry-error-contains']),
  };
};

export const parseChannelGroups = (raw: unknown): Record<string, ChannelGroupSettings[]> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ChannelGroupSettings[]> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const panel = key.trim();
    if (!panel || !Array.isArray(value)) return;
    const seen = new Set<string>();
    const groups: ChannelGroupSettings[] = [];
    value.forEach((item) => {
      const parsed = parseChannelGroupEntry(item);
      if (!parsed || seen.has(parsed.name)) return;
      seen.add(parsed.name);
      groups.push(parsed);
    });
    if (groups.length) out[panel] = groups;
  });
  return out;
};

export const serializeChannelGroups = (
  groups: Record<string, ChannelGroupSettings[]>
): Record<string, Array<Record<string, unknown>>> => {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  Object.entries(groups).forEach(([panel, list]) => {
    const entries = list
      .map((group) => {
        const name = group.name.trim();
        if (!name) return null;
        const payload: Record<string, unknown> = { name };
        if (group.apiKeys.length) payload['api-keys'] = group.apiKeys;
        if (group.channelRetryCount !== undefined) {
          payload['channel-retry-count'] = group.channelRetryCount;
        }
        if (group.channelRetryStatusCodes.length) {
          payload['channel-retry-status-codes'] = group.channelRetryStatusCodes;
        }
        if (group.channelRetryErrorContains.length) {
          payload['channel-retry-error-contains'] = group.channelRetryErrorContains;
        }
        return payload;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
    if (entries.length) out[panel] = entries;
  });
  return out;
};

export const parseStatusCodes = (text: string): number[] =>
  numberList(
    text
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );

export const parseLines = (text: string): string[] =>
  stringList(
    text
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );

export type ChannelGroupValidationError = 'emptyKey' | 'retryCount' | 'statusCode';

export const validateChannelGroupSettings = (
  group: ChannelGroupSettings
): ChannelGroupValidationError | null => {
  if (group.apiKeys.some((key) => key.trim().length === 0)) return 'emptyKey';
  if (
    group.channelRetryCount !== undefined &&
    (!Number.isInteger(group.channelRetryCount) ||
      group.channelRetryCount < 0 ||
      group.channelRetryCount > MAX_CHANNEL_RETRY_COUNT)
  ) {
    return 'retryCount';
  }
  if (group.channelRetryStatusCodes.some((code) => code < 100 || code > 599)) return 'statusCode';
  return null;
};

/**
 * AI 提供商相关 API
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';
import { normalizeOpenAIProvider, normalizeProviderKeyConfig } from './transformers';
import type {
  GeminiKeyConfig,
  OpenAIProviderConfig,
  ProviderKeyConfig,
  ApiKeyEntry,
  ModelAlias,
} from '@/types';
import { applyProviderRetryPayload } from '@/utils/providerRetry';
import { applyStreamFakeFirstTokensPayload } from '@/utils/streamFakeFirstTokens';

const serializeHeaders = (headers?: Record<string, string>) =>
  headers && Object.keys(headers).length ? headers : undefined;

const RESPONSE_ONLY_FIELDS = ['auth-index'] as const;

const PROVIDER_COMMON_KEY_FIELDS = [
  'name',
  'group',
  'api-key',
  'priority',
  'weight',
  'prefix',
  'base-url',
  'proxy-url',
  'headers',
  'models',
  'excluded-models',
  'disable-cooling',
  'hide-no-available-channel',
  'provider-retry-count',
  'provider-retry-status-codes',
] as const;

const GEMINI_KEY_FIELDS = PROVIDER_COMMON_KEY_FIELDS;
const INTERACTIONS_KEY_FIELDS = PROVIDER_COMMON_KEY_FIELDS;
// local-compact and stream-fake-first-tokens are Codex-only. xAI shares the
// backend struct but those settings are never read there, so leave any
// hand-written xAI value untouched on save.
const CODEX_KEY_FIELDS = [
  ...PROVIDER_COMMON_KEY_FIELDS,
  'websockets',
  'local-compact',
  'stream-fake-first-tokens',
] as const;
const XAI_KEY_FIELDS = [...PROVIDER_COMMON_KEY_FIELDS, 'websockets'] as const;
const CLAUDE_KEY_FIELDS = [
  ...PROVIDER_COMMON_KEY_FIELDS,
  'cloak',
  'fingerprint-profile',
  // Keep stripping the deprecated field when a Claude entry is saved.
  'experimental-cch-signing',
] as const;
const VERTEX_KEY_FIELDS = [
  'name',
  'group',
  'api-key',
  'service-account',
  'project-id',
  'location',
  'email',
  'priority',
  'weight',
  'prefix',
  'base-url',
  'proxy-url',
  'headers',
  'models',
  'excluded-models',
  'provider-retry-count',
  'provider-retry-status-codes',
  'hide-no-available-channel',
] as const;
const ANTIGRAVITY_KEY_FIELDS = [...PROVIDER_COMMON_KEY_FIELDS, 'project-id'] as const;

const OPENAI_PROVIDER_FIELDS = [
  'name',
  'group',
  'priority',
  'disabled',
  'prefix',
  'base-url',
  'api-key-entries',
  'headers',
  'models',
  'test-model',
  'disable-cooling',
  'hide-no-available-channel',
  'provider-retry-count',
  'provider-retry-status-codes',
] as const;

const MODEL_ALIAS_FIELDS = ['name', 'alias', 'priority', 'test-model', 'thinking'] as const;
const OPENAI_MODEL_ALIAS_FIELDS = [...MODEL_ALIAS_FIELDS, 'image'] as const;

const API_KEY_ENTRY_FIELDS = ['api-key', 'proxy-url', 'weight'] as const;

const CLOAK_FIELDS = ['mode', 'strict-mode', 'sensitive-words', 'cache-user-id'] as const;

const getStringField = (record: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
};

const openAIProviderIdentity = (record: Record<string, unknown>) =>
  getStringField(record, ['name']);

const modelIdentity = (record: Record<string, unknown>) => getStringField(record, ['name']);

const apiKeyEntryIdentity = (record: Record<string, unknown>) =>
  getStringField(record, ['api-key']);

const cloneWithoutKnownFields = (
  raw: unknown,
  knownFields: readonly string[]
): Record<string, unknown> => {
  const next: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  [...knownFields, ...RESPONSE_ONLY_FIELDS].forEach((field) => {
    delete next[field];
  });
  return next;
};

const mergeKnownFields = (
  raw: unknown,
  payload: Record<string, unknown>,
  knownFields: readonly string[]
) => {
  const next = cloneWithoutKnownFields(raw, knownFields);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      next[key] = value;
    }
  });
  return next;
};

const findRawRecord = (
  rawRecords: Array<Record<string, unknown> | undefined>,
  usedIndexes: Set<number>,
  payload: Record<string, unknown>,
  index: number,
  getIdentity: (record: Record<string, unknown>) => string,
  fallbackByIndex = true
) => {
  const identity = getIdentity(payload);
  if (identity) {
    for (let i = 0; i < rawRecords.length; i += 1) {
      const candidate = rawRecords[i];
      if (!candidate || usedIndexes.has(i)) continue;
      if (getIdentity(candidate) === identity) {
        usedIndexes.add(i);
        return candidate;
      }
    }
  }

  if (fallbackByIndex) {
    const fallback = rawRecords[index];
    if (fallback && !usedIndexes.has(index)) {
      usedIndexes.add(index);
      return fallback;
    }
  }

  return undefined;
};

const mergeKnownRecordList = (
  rawItems: unknown,
  payloadItems: Record<string, unknown>[],
  knownFields: readonly string[],
  getIdentity: (record: Record<string, unknown>) => string,
  fallbackByIndex = true
) => {
  const rawRecords = Array.isArray(rawItems)
    ? rawItems.map((item) => (isRecord(item) ? item : undefined))
    : [];
  const usedIndexes = new Set<number>();

  return payloadItems.map((payload, index) => {
    const raw = findRawRecord(
      rawRecords,
      usedIndexes,
      payload,
      index,
      getIdentity,
      fallbackByIndex
    );
    return mergeKnownFields(raw, payload, knownFields);
  });
};

const getRawSectionList = (rawConfig: unknown, section: string): unknown[] => {
  if (!isRecord(rawConfig)) return [];
  const value = rawConfig[section];
  return Array.isArray(value) ? value : [];
};

type ProviderRecordMerger = (
  raw: unknown,
  payload: Record<string, unknown>
) => Record<string, unknown>;

export function appendLatestProviderRecord(
  latestItems: unknown[],
  payload: Record<string, unknown>,
  mergePayload: ProviderRecordMerger
): unknown[] {
  return [...latestItems, mergePayload(undefined, payload)];
}

export function replaceLatestProviderRecord(
  latestItems: unknown[],
  isTarget: (record: Record<string, unknown>, index: number) => boolean,
  payload: Record<string, unknown>,
  mergePayload: ProviderRecordMerger
): unknown[] {
  const targetIndex = latestItems.findIndex(
    (item, index) => isRecord(item) && isTarget(item, index)
  );
  if (targetIndex < 0) {
    throw new Error('Provider configuration changed; refresh and try again.');
  }

  return latestItems.map((item, index) =>
    index === targetIndex ? mergePayload(item, payload) : item
  );
}

const mutateLatestProviderList = async (
  section: string,
  mutate: (latestItems: unknown[]) => unknown[]
) => {
  const rawConfig = await apiClient.get('/config');
  const latestItems = getRawSectionList(rawConfig, section);
  await apiClient.put(`/${section}`, mutate(latestItems));
};

export interface ChannelMatch {
  name?: string | null;
  index: number;
}

const matchesChannel = (
  record: Record<string, unknown>,
  index: number,
  match: ChannelMatch
): boolean => {
  const name = String(match.name ?? '').trim();
  if (name) return getStringField(record, ['name']) === name;
  return index === match.index;
};

const deleteChannel = (section: string, match: ChannelMatch) => {
  const params = new URLSearchParams();
  const name = String(match.name ?? '').trim();
  if (name) params.set('name', name);
  else params.set('index', String(match.index));
  return apiClient.delete(`/${section}?${params.toString()}`);
};

export const duplicateProviderRecord = (section: string, match: ChannelMatch, name: string) =>
  mutateLatestProviderList(section, (latestItems) => {
    const sourceIndex = latestItems.findIndex(
      (item, index) => isRecord(item) && matchesChannel(item, index, match)
    );
    if (sourceIndex < 0) {
      throw new Error('Provider configuration changed; refresh and try again.');
    }
    const source = latestItems[sourceIndex];
    if (!isRecord(source)) {
      throw new Error('Provider configuration changed; refresh and try again.');
    }
    const clone: Record<string, unknown> = { ...source, name };
    delete clone['auth-index'];
    return [...latestItems, clone];
  });

const matchesOpenAIProvider = (record: Record<string, unknown>, name: string) =>
  openAIProviderIdentity(record) === name.trim();

const mergeModelPayloads = (
  raw: unknown,
  models: unknown,
  knownFields: readonly string[] = MODEL_ALIAS_FIELDS
) =>
  Array.isArray(models)
    ? mergeKnownRecordList(
        isRecord(raw) ? raw.models : undefined,
        models.filter(isRecord),
        knownFields,
        modelIdentity,
        false
      )
    : undefined;

const mergeProviderKeyPayload = (
  raw: unknown,
  payload: Record<string, unknown>,
  knownFields: readonly string[]
) => {
  const next = mergeKnownFields(raw, payload, knownFields);
  const models = mergeModelPayloads(raw, payload.models);
  if (models) next.models = models;
  if (isRecord(payload.cloak)) {
    next.cloak = mergeKnownFields(
      isRecord(raw) ? raw.cloak : undefined,
      payload.cloak,
      CLOAK_FIELDS
    );
  }
  return next;
};

const mergeOpenAIProviderPayload = (raw: unknown, payload: Record<string, unknown>) => {
  const next = mergeKnownFields(raw, payload, OPENAI_PROVIDER_FIELDS);
  const rawApiKeyEntries = isRecord(raw) ? raw['api-key-entries'] : undefined;
  const apiKeyEntries = payload['api-key-entries'];
  if (Array.isArray(apiKeyEntries)) {
    next['api-key-entries'] = mergeKnownRecordList(
      rawApiKeyEntries,
      apiKeyEntries.filter(isRecord),
      API_KEY_ENTRY_FIELDS,
      apiKeyEntryIdentity
    );
  }
  const models = mergeModelPayloads(raw, payload.models, OPENAI_MODEL_ALIAS_FIELDS);
  if (models) next.models = models;
  return next;
};

const extractArrayPayload = (data: unknown, key: string): unknown[] => {
  if (!isRecord(data)) return [];
  const list = data[key];
  return Array.isArray(list) ? list : [];
};

const serializeModelAliases = (models?: ModelAlias[], includeOpenAIFields = false) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          if (!model?.name) return null;
          const payload: Record<string, unknown> = { name: model.name };
          if (model.alias && model.alias !== model.name) {
            payload.alias = model.alias;
          }
          if (model.priority !== undefined) {
            payload.priority = model.priority;
          }
          if (model.testModel) {
            payload['test-model'] = model.testModel;
          }
          if (includeOpenAIFields && model.image) {
            payload.image = true;
          }
          if (model.thinking) {
            payload.thinking = model.thinking;
          }
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeApiKeyEntry = (entry: ApiKeyEntry) => {
  const payload: Record<string, unknown> = { 'api-key': entry.apiKey };
  if (entry.proxyUrl) payload['proxy-url'] = entry.proxyUrl;
  if (entry.weight !== undefined) payload.weight = entry.weight;
  return payload;
};

const serializeProviderKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey };
  if (config.name?.trim()) payload.name = config.name.trim();
  if (config.group?.trim()) payload.group = config.group.trim();
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.weight !== undefined) payload.weight = config.weight;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.websockets !== undefined) payload.websockets = config.websockets;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  if (config.disableCooling) payload['disable-cooling'] = true;
  if (config.hideNoAvailableChannel) payload['hide-no-available-channel'] = true;
  // Omitting local-compact drops the override, so an explicit false must survive.
  if (config.localCompact !== undefined) payload['local-compact'] = config.localCompact;
  applyStreamFakeFirstTokensPayload(payload, config.streamFakeFirstTokens);
  applyProviderRetryPayload(payload, config);
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  if (config.cloak) {
    const cloakPayload: Record<string, unknown> = {};
    const mode = config.cloak.mode?.trim();
    if (mode) cloakPayload.mode = mode;
    if (config.cloak.strictMode !== undefined)
      cloakPayload['strict-mode'] = config.cloak.strictMode;
    if (config.cloak.sensitiveWords && config.cloak.sensitiveWords.length) {
      cloakPayload['sensitive-words'] = config.cloak.sensitiveWords;
    }
    if (config.cloak.cacheUserId) {
      cloakPayload['cache-user-id'] = true;
    }
    if (Object.keys(cloakPayload).length) {
      payload.cloak = cloakPayload;
    }
  }
  if (config.fingerprintProfile?.trim()) {
    payload['fingerprint-profile'] = config.fingerprintProfile.trim();
  }
  return payload;
};

const serializeVertexModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          const name = typeof model?.name === 'string' ? model.name.trim() : '';
          const alias = typeof model?.alias === 'string' ? model.alias.trim() : '';
          if (!name || !alias) return null;
          return {
            name,
            alias,
            ...(model.thinking ? { thinking: model.thinking } : {}),
          };
        })
        .filter(Boolean)
    : undefined;

const serializeVertexKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey ?? '' };
  if (config.name?.trim()) payload.name = config.name.trim();
  if (config.group?.trim()) payload.group = config.group.trim();
  if (config.serviceAccount && Object.keys(config.serviceAccount).length) {
    payload['service-account'] = config.serviceAccount;
  }
  if (config.projectId?.trim()) payload['project-id'] = config.projectId.trim();
  if (config.location?.trim()) payload.location = config.location.trim();
  if (config.email?.trim()) payload.email = config.email.trim();
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.weight !== undefined) payload.weight = config.weight;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeVertexModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  applyProviderRetryPayload(payload, config);
  if (config.hideNoAvailableChannel) payload['hide-no-available-channel'] = true;
  return payload;
};

const serializeAntigravityKey = (config: ProviderKeyConfig) => {
  const payload = serializeGeminiKey(config);
  if (config.projectId?.trim()) payload['project-id'] = config.projectId.trim();
  return payload;
};

const serializeGeminiKey = (config: GeminiKeyConfig) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey };
  if (config.name?.trim()) payload.name = config.name.trim();
  if (config.group?.trim()) payload.group = config.group.trim();
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.weight !== undefined) payload.weight = config.weight;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  if (config.disableCooling) payload['disable-cooling'] = true;
  if (config.hideNoAvailableChannel) payload['hide-no-available-channel'] = true;
  applyProviderRetryPayload(payload, config);
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  return payload;
};

const serializeOpenAIProvider = (provider: OpenAIProviderConfig) => {
  const payload: Record<string, unknown> = {
    name: provider.name,
    'base-url': provider.baseUrl,
    'api-key-entries': Array.isArray(provider.apiKeyEntries)
      ? provider.apiKeyEntries.map((entry) => serializeApiKeyEntry(entry))
      : [],
  };
  if (provider.group?.trim()) payload.group = provider.group.trim();
  if (provider.prefix?.trim()) payload.prefix = provider.prefix.trim();
  if (provider.disabled !== undefined) payload.disabled = provider.disabled;
  const headers = serializeHeaders(provider.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(provider.models, true);
  if (models && models.length) payload.models = models;
  if (provider.priority !== undefined) payload.priority = provider.priority;
  if (provider.testModel) payload['test-model'] = provider.testModel;
  if (provider.disableCooling) payload['disable-cooling'] = true;
  if (provider.hideNoAvailableChannel) payload['hide-no-available-channel'] = true;
  applyProviderRetryPayload(payload, provider);
  return payload;
};

export const providersApi = {
  createGeminiKey: (config: GeminiKeyConfig) =>
    mutateLatestProviderList('gemini-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeGeminiKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, GEMINI_KEY_FIELDS)
      )
    ),

  updateGeminiKey: (match: ChannelMatch, config: GeminiKeyConfig) =>
    mutateLatestProviderList('gemini-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) => matchesChannel(record, index, match),
        serializeGeminiKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, GEMINI_KEY_FIELDS)
      )
    ),

  deleteGeminiKey: (match: ChannelMatch) => deleteChannel('gemini-api-key', match),

  createInteractionsKey: (config: GeminiKeyConfig) =>
    mutateLatestProviderList('interactions-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeGeminiKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, INTERACTIONS_KEY_FIELDS)
      )
    ),

  updateInteractionsKey: (match: ChannelMatch, config: GeminiKeyConfig) =>
    mutateLatestProviderList('interactions-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) => matchesChannel(record, index, match),
        serializeGeminiKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, INTERACTIONS_KEY_FIELDS)
      )
    ),

  deleteInteractionsKey: (match: ChannelMatch) => deleteChannel('interactions-api-key', match),

  createCodexConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('codex-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeProviderKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, CODEX_KEY_FIELDS)
      )
    ),

  updateCodexConfig: (match: ChannelMatch, config: ProviderKeyConfig) =>
    mutateLatestProviderList('codex-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) => matchesChannel(record, index, match),
        serializeProviderKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, CODEX_KEY_FIELDS)
      )
    ),

  deleteCodexConfig: (match: ChannelMatch) => deleteChannel('codex-api-key', match),

  createXAIConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('xai-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeProviderKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, XAI_KEY_FIELDS)
      )
    ),

  updateXAIConfig: (match: ChannelMatch, config: ProviderKeyConfig) =>
    mutateLatestProviderList('xai-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) => matchesChannel(record, index, match),
        serializeProviderKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, XAI_KEY_FIELDS)
      )
    ),

  deleteXAIConfig: (match: ChannelMatch) => deleteChannel('xai-api-key', match),

  createClaudeConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('claude-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeProviderKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, CLAUDE_KEY_FIELDS)
      )
    ),

  updateClaudeConfig: (match: ChannelMatch, config: ProviderKeyConfig) =>
    mutateLatestProviderList('claude-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) => matchesChannel(record, index, match),
        serializeProviderKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, CLAUDE_KEY_FIELDS)
      )
    ),

  deleteClaudeConfig: (match: ChannelMatch) => deleteChannel('claude-api-key', match),

  async getVertexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/vertex-api-key');
    const list = extractArrayPayload(data, 'vertex-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  createVertexConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('vertex-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeVertexKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, VERTEX_KEY_FIELDS)
      )
    ),

  updateVertexConfig: (match: ChannelMatch, config: ProviderKeyConfig) =>
    mutateLatestProviderList('vertex-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) => matchesChannel(record, index, match),
        serializeVertexKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, VERTEX_KEY_FIELDS)
      )
    ),

  deleteVertexConfig: (match: ChannelMatch) => deleteChannel('vertex-api-key', match),

  async getAntigravityConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/antigravity-api-key');
    const list = extractArrayPayload(data, 'antigravity-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  createAntigravityConfig: (config: ProviderKeyConfig) =>
    mutateLatestProviderList('antigravity-api-key', (latestItems) =>
      appendLatestProviderRecord(latestItems, serializeAntigravityKey(config), (raw, payload) =>
        mergeProviderKeyPayload(raw, payload, ANTIGRAVITY_KEY_FIELDS)
      )
    ),

  updateAntigravityConfig: (match: ChannelMatch, config: ProviderKeyConfig) =>
    mutateLatestProviderList('antigravity-api-key', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, index) => matchesChannel(record, index, match),
        serializeAntigravityKey(config),
        (raw, payload) => mergeProviderKeyPayload(raw, payload, ANTIGRAVITY_KEY_FIELDS)
      )
    ),

  deleteAntigravityConfig: (match: ChannelMatch) => deleteChannel('antigravity-api-key', match),

  putChannelGroups: (groups: Record<string, Array<Record<string, unknown>>>) =>
    apiClient.put('/channel-groups', { 'channel-groups': groups }),

  async getOpenAIProviders(): Promise<OpenAIProviderConfig[]> {
    const data = await apiClient.get('/openai-compatibility');
    const list = extractArrayPayload(data, 'openai-compatibility');
    return list
      .map((item, index) => normalizeOpenAIProvider(item, index))
      .filter(Boolean) as OpenAIProviderConfig[];
  },

  createOpenAIProvider: (provider: OpenAIProviderConfig) =>
    mutateLatestProviderList('openai-compatibility', (latestItems) =>
      appendLatestProviderRecord(
        latestItems,
        serializeOpenAIProvider(provider),
        mergeOpenAIProviderPayload
      )
    ),

  updateOpenAIProvider: (name: string, index: number, provider: OpenAIProviderConfig) =>
    mutateLatestProviderList('openai-compatibility', (latestItems) =>
      replaceLatestProviderRecord(
        latestItems,
        (record, currentIndex) => currentIndex === index && matchesOpenAIProvider(record, name),
        serializeOpenAIProvider(provider),
        mergeOpenAIProviderPayload
      )
    ),

  updateOpenAIProviderDisabled: (index: number, disabled: boolean) =>
    apiClient.patch('/openai-compatibility', { index, value: { disabled } }),

  deleteOpenAIProvider: (index: number) =>
    apiClient.delete(`/openai-compatibility?index=${encodeURIComponent(String(index))}`),
};

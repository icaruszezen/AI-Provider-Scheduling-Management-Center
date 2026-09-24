import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { duplicateProviderRecord, providersApi } from '@/services/api/providers';
import { getErrorMessage } from '@/utils/helpers';
import { useAuthStore, useConfigStore } from '@/stores';
import {
  stripDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import type { GeminiKeyConfig, ModelAlias, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import { localCompactModeToConfig } from '@/utils/localCompact';
import { providerRetryFieldsFromForm as retryFieldsFromForm } from '@/utils/providerRetry';
import { maxConcurrentConnectionsFromForm } from '@/utils/maxConcurrentConnections';
import { streamFirstTokenTimeoutFromForm } from '@/utils/streamFirstTokenTimeout';
import { sanitizeStreamFakeFirstTokens } from '@/utils/streamFakeFirstTokens';
import {
  claudeToResource,
  codexToResource,
  geminiToResource,
  interactionsToResource,
  openaiToResource,
  lmuAIToResources,
  kimiToResources,
  antigravityToResource,
  vertexToResource,
  xaiToResource,
} from './adapters';
import { channelGroupKey, nextCopyName } from './channelIdentity';
import {
  emptyChannelGroup,
  serializeChannelGroups,
  type ChannelGroupSettings,
} from './channelGroups';
import { PROVIDER_BRAND_ORDER } from './descriptors';
import { buildThinkingFromLevels } from './thinkingLevels';
import type {
  ProviderBrand,
  ProviderEntryFormInput,
  ProviderGroup,
  ProviderResource,
  ProviderSnapshot,
  SponsorKeyEntryInput,
  SponsorProviderBrand,
  SponsorProviderRaw,
} from './types';
import {
  buildLmuAIRaw,
  isLmuAIClaudeProvider,
  isLmuAICodexProvider,
  isLmuAIGeminiProvider,
  isLmuAIOpenAIProvider,
} from './lmuAI';
import {
  buildKimiRaw,
  isKimiClaudeProvider,
  isKimiCodexProvider,
  isKimiOpenAIProvider,
} from './kimi';
import {
  getSponsorProviderDefinition,
  isTemporarilyHiddenSponsorBrand,
  type SponsorProtocolUrls,
} from './sponsorDefinitions';
import { runSponsorMutationWithRecovery } from './sponsorMutationRecovery';

export interface UseProviderWorkbenchResult {
  connected: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  errorMessage: string | null;
  snapshot: ProviderSnapshot | null;
  channelGroups: Record<string, ChannelGroupSettings[]>;
  refetch: () => Promise<void>;

  createProvider: (brand: ProviderBrand, input: ProviderEntryFormInput) => Promise<void>;
  updateProvider: (resource: ProviderResource, input: ProviderEntryFormInput) => Promise<void>;
  deleteProvider: (resource: ProviderResource) => Promise<void>;
  toggleDisabled: (resource: ProviderResource, disabled: boolean) => Promise<void>;
  copyProvider: (resource: ProviderResource) => Promise<void>;
  createChannelGroup: (brand: ProviderBrand, name: string) => Promise<void>;
  renameChannelGroup: (brand: ProviderBrand, from: string, to: string) => Promise<void>;
  deleteChannelGroup: (brand: ProviderBrand, name: string) => Promise<void>;
  updateChannelGroup: (brand: ProviderBrand, settings: ChannelGroupSettings) => Promise<void>;
  mutating: boolean;
  refreshSnapshot: () => void;
}

/* -------------------------------------------------------------------------- */
/* form -> backend config 转换                                                 */
/* -------------------------------------------------------------------------- */

const parseTextList = (text: string): string[] =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const headersFromEntries = (
  entries: Array<{ key: string; value: string }>
): Record<string, string> => {
  const out: Record<string, string> = {};
  entries.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) return;
    out[key] = entry.value;
  });
  return out;
};

const parseThinkingJson = (value: string | undefined): Record<string, unknown> | undefined => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Thinking config must be a JSON object');
  }
  return parsed as Record<string, unknown>;
};

/**
 * `'*'` 是「该 provider 已停用」的编码，其唯一所有者是 `form.disabled`：
 * 载入时 `stripDisableAllModelsRule` 把它剥进该 flag，保存时仅凭该 flag 重新追加。
 * 因此这里必须过滤掉用户在文本里手打的 `'*'`——排除模型的编辑面永远不该能开关停用。
 * 导出仅为让 tests/providerExcludedModelsDisableRule.test.ts 钉住这个不变量。
 */
export const buildExcludedModels = (
  textValue: string,
  disabled: boolean,
  brand: ProviderBrand
): string[] | undefined => {
  const list = parseTextList(textValue);
  const filtered = list.filter((v) => v !== '*');
  if (brand === 'openaiCompatibility') {
    return filtered.length ? filtered : undefined;
  }
  if (disabled) {
    return withDisableAllModelsRule(filtered);
  }
  return filtered.length ? filtered : undefined;
};

const buildModelAliases = (
  models: ProviderEntryFormInput['models'] | undefined,
  includeImage = false
): ModelAlias[] =>
  (models ?? [])
    .map((m) => {
      const entry: ModelAlias = {
        name: m.name.trim(),
        alias: m.alias?.trim() || undefined,
        priority: m.priority,
        testModel: m.testModel,
        thinking: m.thinkingLevelsTouched
          ? buildThinkingFromLevels(m.thinkingLevels)
          : parseThinkingJson(m.thinkingJson),
      };
      if (includeImage) {
        entry.image = m.image === true;
      }
      return entry;
    })
    .filter((m) => m.name);

const parseServiceAccountText = (text: string | undefined): Record<string, unknown> | undefined => {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Service account must be a JSON object');
  }
  return parsed as Record<string, unknown>;
};

const buildProviderKeyConfig = (
  brand: 'gemini' | 'interactions' | 'codex' | 'xai' | 'claude' | 'vertex' | 'antigravity',
  input: ProviderEntryFormInput,
  existing?: ProviderKeyConfig | GeminiKeyConfig | null
): ProviderKeyConfig | GeminiKeyConfig => {
  const headers = headersFromEntries(input.headers);
  const models = buildModelAliases(input.models);
  const excluded = buildExcludedModels(input.excludedModelsText, input.disabled, brand);
  const apiKeyChanged = input.apiKey.trim().length > 0;
  const next: ProviderKeyConfig = {
    apiKey: apiKeyChanged ? input.apiKey.trim() : (existing?.apiKey ?? ''),
    name: input.name.trim() || undefined,
    group: input.group.trim() || undefined,
    priority: input.priority,
    weight: input.weight,
    prefix: input.prefix.trim() || undefined,
    baseUrl: input.baseUrl.trim() || undefined,
    proxyUrl: input.proxyUrl.trim() || undefined,
    models: models.length ? models : undefined,
    headers: Object.keys(headers).length ? headers : undefined,
    excludedModels: excluded,
    disableCooling: input.disableCooling === true,
    hideNoAvailableChannel: input.hideNoAvailableChannel === true,
    ...retryFieldsFromForm(input),
    streamFirstTokenTimeoutSeconds: streamFirstTokenTimeoutFromForm(
      input.streamFirstTokenTimeoutSeconds
    ),
    maxConcurrentConnections: maxConcurrentConnectionsFromForm(input.maxConcurrentConnections),
    authIndex: existing?.authIndex,
  };
  if ((brand === 'codex' || brand === 'xai') && input.websockets !== undefined) {
    next.websockets = input.websockets;
  }
  if (brand === 'codex') {
    next.localCompact = localCompactModeToConfig(input.localCompact);
    const streamFakeFirstTokens = sanitizeStreamFakeFirstTokens(input.streamFakeFirstTokens);
    if (streamFakeFirstTokens.length) {
      next.streamFakeFirstTokens = streamFakeFirstTokens;
    }
  }
  if (brand === 'claude' && input.cloak) {
    next.cloak = {
      mode: input.cloak.mode.trim() || undefined,
      strictMode: input.cloak.strictMode,
      sensitiveWords: parseTextList(input.cloak.sensitiveWordsText),
      cacheUserId: input.cloak.cacheUserId === true,
    };
  }
  if (brand === 'claude') {
    next.fingerprintProfile = input.fingerprintProfile?.trim() || undefined;
  }
  if (brand === 'antigravity' || brand === 'vertex') {
    const existingKey = existing as ProviderKeyConfig | undefined;
    next.projectId = input.projectId?.trim() || existingKey?.projectId;
  }
  if (brand === 'vertex') {
    const existingKey = existing as ProviderKeyConfig | undefined;
    next.location = input.location?.trim() || existingKey?.location;
    next.email = input.email?.trim() || existingKey?.email;
    next.serviceAccount =
      parseServiceAccountText(input.serviceAccountText) ?? existingKey?.serviceAccount;
  }
  return next;
};

const buildOpenAIConfig = (
  input: ProviderEntryFormInput,
  existing?: OpenAIProviderConfig | null
): OpenAIProviderConfig => {
  const headers = headersFromEntries(input.headers);
  const models = buildModelAliases(input.models, true);
  const apiKeyEntries =
    input.apiKeyEntries
      ?.map((entry, index) => {
        const fallbackApiKey =
          entry.existingApiKey?.trim() || existing?.apiKeyEntries?.[index]?.apiKey?.trim() || '';
        return {
          apiKey: entry.apiKey.trim() || fallbackApiKey,
          proxyUrl: entry.proxyUrl.trim() || undefined,
          weight: entry.weight,
          authIndex: entry.authIndex?.trim() || undefined,
        };
      })
      .filter((entry) => entry.apiKey) ?? [];

  return {
    ...(existing ?? {}),
    name: input.name.trim(),
    group: input.group.trim() || undefined,
    baseUrl: input.baseUrl.trim(),
    prefix: input.prefix.trim() || undefined,
    apiKeyEntries,
    disabled: input.disabled,
    disableCooling: input.disableCooling === true,
    hideNoAvailableChannel: input.hideNoAvailableChannel === true,
    ...retryFieldsFromForm(input),
    streamFirstTokenTimeoutSeconds: streamFirstTokenTimeoutFromForm(
      input.streamFirstTokenTimeoutSeconds
    ),
    maxConcurrentConnections: maxConcurrentConnectionsFromForm(input.maxConcurrentConnections),
    headers: Object.keys(headers).length ? headers : undefined,
    models: models.length ? models : undefined,
    priority: input.priority,
    testModel: input.testModel?.trim() || undefined,
  };
};

const sponsorEntryApiKey = (entry: SponsorKeyEntryInput): string =>
  entry.apiKey.trim() || entry.existingApiKey?.trim() || '';

const buildSponsorOpenAIConfig = (
  entry: SponsorKeyEntryInput,
  providerName: string,
  channelName: string,
  group: string | undefined,
  getProtocolUrls: (value: string | undefined | null) => SponsorProtocolUrls,
  existing?: OpenAIProviderConfig
): OpenAIProviderConfig => {
  const urls = getProtocolUrls(entry.baseUrl);
  const models = buildModelAliases(entry.models, true);
  const apiKey = sponsorEntryApiKey(entry);
  const firstExistingEntry = existing?.apiKeyEntries?.[0];
  const apiKeyEntries = apiKey
    ? [
        {
          ...(firstExistingEntry ?? {}),
          apiKey,
          proxyUrl: entry.proxyUrl.trim() || undefined,
          weight: entry.weight,
        },
      ]
    : [];

  return {
    ...(existing ?? {}),
    name: channelName || providerName,
    group,
    baseUrl: urls.openai,
    prefix: entry.prefix.trim() || undefined,
    disabled: entry.disabled,
    disableCooling: entry.disableCooling === true,
    hideNoAvailableChannel: entry.hideNoAvailableChannel === true,
    ...retryFieldsFromForm(entry),
    streamFirstTokenTimeoutSeconds: streamFirstTokenTimeoutFromForm(
      entry.streamFirstTokenTimeoutSeconds
    ),
    maxConcurrentConnections: maxConcurrentConnectionsFromForm(entry.maxConcurrentConnections),
    priority: entry.priority,
    apiKeyEntries,
    models: models.length ? models : undefined,
  };
};

const buildSponsorProviderKeyConfig = (
  entry: SponsorKeyEntryInput,
  protocol: 'claude' | 'codex',
  channelName: string,
  group: string | undefined,
  getProtocolUrls: (value: string | undefined | null) => SponsorProtocolUrls,
  existing?: ProviderKeyConfig
): ProviderKeyConfig => {
  const urls = getProtocolUrls(entry.baseUrl);
  const models = buildModelAliases(entry.models);
  const apiKey = sponsorEntryApiKey(entry);
  const excluded = entry.disabled
    ? withDisableAllModelsRule(stripDisableAllModelsRule(existing?.excludedModels))
    : withoutDisableAllModelsRule(existing?.excludedModels);

  return {
    ...(existing ?? {}),
    name: channelName || undefined,
    group,
    apiKey,
    baseUrl: protocol === 'claude' ? urls.anthropic : urls.codex,
    proxyUrl: entry.proxyUrl.trim() || undefined,
    prefix: entry.prefix.trim() || undefined,
    priority: entry.priority,
    weight: entry.weight,
    disableCooling: entry.disableCooling === true,
    hideNoAvailableChannel: entry.hideNoAvailableChannel === true,
    ...retryFieldsFromForm(entry),
    streamFirstTokenTimeoutSeconds: streamFirstTokenTimeoutFromForm(
      entry.streamFirstTokenTimeoutSeconds
    ),
    maxConcurrentConnections: maxConcurrentConnectionsFromForm(entry.maxConcurrentConnections),
    excludedModels: excluded,
    models: models.length ? models : undefined,
  };
};

const buildSponsorGeminiConfig = (
  entry: SponsorKeyEntryInput,
  channelName: string,
  group: string | undefined,
  getProtocolUrls: (value: string | undefined | null) => SponsorProtocolUrls,
  existing?: GeminiKeyConfig
): GeminiKeyConfig => {
  const urls = getProtocolUrls(entry.baseUrl);
  const models = buildModelAliases(entry.models);
  const apiKey = sponsorEntryApiKey(entry);
  const excluded = entry.disabled
    ? withDisableAllModelsRule(stripDisableAllModelsRule(existing?.excludedModels))
    : withoutDisableAllModelsRule(existing?.excludedModels);

  return {
    ...(existing ?? {}),
    name: channelName || undefined,
    group,
    apiKey,
    baseUrl: urls.gemini,
    proxyUrl: entry.proxyUrl.trim() || undefined,
    prefix: entry.prefix.trim() || undefined,
    priority: entry.priority,
    weight: entry.weight,
    disableCooling: entry.disableCooling === true,
    hideNoAvailableChannel: entry.hideNoAvailableChannel === true,
    ...retryFieldsFromForm(entry),
    streamFirstTokenTimeoutSeconds: streamFirstTokenTimeoutFromForm(
      entry.streamFirstTokenTimeoutSeconds
    ),
    maxConcurrentConnections: maxConcurrentConnectionsFromForm(entry.maxConcurrentConnections),
    excludedModels: excluded,
    models: models.length ? models : undefined,
  };
};

const normalizeSponsorKeyEntries = (
  entries: SponsorKeyEntryInput[] | undefined
): SponsorKeyEntryInput[] => (entries ?? []).filter((entry) => sponsorEntryApiKey(entry));

const toggleSponsorConfig = async (raw: SponsorProviderRaw, disabled: boolean) => {
  for (const item of raw.gemini) {
    const excludedModels = disabled
      ? withDisableAllModelsRule(item.config.excludedModels)
      : withoutDisableAllModelsRule(item.config.excludedModels);
    await providersApi.updateGeminiKey(
      { name: item.config.name, index: item.index },
      {
        ...item.config,
        excludedModels,
      }
    );
  }
  for (const item of raw.codex) {
    const excludedModels = disabled
      ? withDisableAllModelsRule(item.config.excludedModels)
      : withoutDisableAllModelsRule(item.config.excludedModels);
    await providersApi.updateCodexConfig(
      { name: item.config.name, index: item.index },
      {
        ...item.config,
        excludedModels,
      }
    );
  }
  for (const item of raw.claude) {
    const excludedModels = disabled
      ? withDisableAllModelsRule(item.config.excludedModels)
      : withoutDisableAllModelsRule(item.config.excludedModels);
    await providersApi.updateClaudeConfig(
      { name: item.config.name, index: item.index },
      {
        ...item.config,
        excludedModels,
      }
    );
  }
  for (const item of raw.openai) {
    await providersApi.updateOpenAIProviderDisabled(item.index, disabled);
  }
};

/* -------------------------------------------------------------------------- */
/* hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useProviderWorkbench(): UseProviderWorkbenchResult {
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const config = useConfigStore((s) => s.config);
  const fetchConfig = useConfigStore((s) => s.fetchConfig);
  const updateConfigValue = useConfigStore((s) => s.updateConfigValue);
  const isCacheValid = useConfigStore((s) => s.isCacheValid);

  const [isPending, setIsPending] = useState<boolean>(() => !isCacheValid());
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mutating, setMutating] = useState<boolean>(false);
  const [fetchedAt, setFetchedAt] = useState<string>(() => new Date().toISOString());

  const hasFetchedRef = useRef(false);

  const connected = connectionStatus === 'connected';

  const refetch = useCallback(async () => {
    setIsFetching(true);
    setErrorMessage(null);
    try {
      const [configResult, vertexResult, antigravityResult, openaiResult] =
        await Promise.allSettled([
          fetchConfig(true),
          providersApi.getVertexConfigs(),
          providersApi.getAntigravityConfigs(),
          providersApi.getOpenAIProviders(),
        ]);
      if (configResult.status !== 'fulfilled') {
        throw configResult.reason;
      }
      if (vertexResult.status === 'fulfilled') {
        updateConfigValue('vertex-api-key', vertexResult.value || []);
      }
      if (antigravityResult.status === 'fulfilled') {
        updateConfigValue('antigravity-api-key', antigravityResult.value || []);
      }
      if (openaiResult.status === 'fulfilled') {
        updateConfigValue('openai-compatibility', openaiResult.value || []);
      }
      setFetchedAt(new Date().toISOString());
    } catch (err) {
      setErrorMessage(getErrorMessage(err) || 'Failed to load providers');
    } finally {
      setIsPending(false);
      setIsFetching(false);
    }
  }, [fetchConfig, updateConfigValue]);

  const refreshSnapshot = useCallback(() => {
    setFetchedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    if (!connected) return;
    hasFetchedRef.current = true;
    refetch().catch(() => {});
  }, [connected, refetch]);

  /* ------------------- snapshot 计算 ------------------- */

  const snapshot = useMemo<ProviderSnapshot | null>(() => {
    if (!config) return null;
    const groups: ProviderGroup[] = PROVIDER_BRAND_ORDER.map((brand) => {
      let resources: ProviderResource[] = [];
      switch (brand) {
        case 'gemini':
          resources = (config.geminiApiKeys ?? []).reduce<ProviderResource[]>(
            (out, item, index) => {
              if (!isLmuAIGeminiProvider(item)) {
                out.push(geminiToResource(item, index));
              }
              return out;
            },
            []
          );
          break;
        case 'interactions':
          resources = (config.interactionsApiKeys ?? []).map((item, index) =>
            interactionsToResource(item, index)
          );
          break;
        case 'codex':
          resources = (config.codexApiKeys ?? []).reduce<ProviderResource[]>((out, item, index) => {
            if (!isLmuAICodexProvider(item) && !isKimiCodexProvider(item)) {
              out.push(codexToResource(item, index));
            }
            return out;
          }, []);
          break;
        case 'xai':
          resources = (config.xaiApiKeys ?? []).map((item, index) => xaiToResource(item, index));
          break;
        case 'claude':
          resources = (config.claudeApiKeys ?? []).reduce<ProviderResource[]>(
            (out, item, index) => {
              if (!isLmuAIClaudeProvider(item) && !isKimiClaudeProvider(item)) {
                out.push(claudeToResource(item, index));
              }
              return out;
            },
            []
          );
          break;
        case 'vertex':
          resources = (config.vertexApiKeys ?? []).map((c, i) => vertexToResource(c, i));
          break;
        case 'antigravity':
          resources = (config.antigravityApiKeys ?? []).map((c, i) => antigravityToResource(c, i));
          break;
        case 'openaiCompatibility':
          resources = (config.openaiCompatibility ?? []).reduce<ProviderResource[]>(
            (out, item, index) => {
              if (!isLmuAIOpenAIProvider(item) && !isKimiOpenAIProvider(item)) {
                out.push(openaiToResource(item, index));
              }
              return out;
            },
            []
          );
          break;
        case 'lmuAI':
          resources = lmuAIToResources(buildLmuAIRaw(config));
          break;
        case 'kimi':
          resources = kimiToResources(buildKimiRaw(config));
          break;
      }
      return {
        id: brand,
        resources,
      };
    });
    return {
      fetchedAt,
      groups: groups.filter((group) => !isTemporarilyHiddenSponsorBrand(group.id)),
    };
  }, [config, fetchedAt]);

  /* ------------------- mutations ------------------- */

  const persistSponsorConfig = useCallback(
    async (
      brand: SponsorProviderBrand,
      input: ProviderEntryFormInput,
      existingRaw?: SponsorProviderRaw | null
    ) => {
      const definition = getSponsorProviderDefinition(brand);
      const raw = existingRaw ?? { openai: [], claude: [], codex: [], gemini: [] };
      const channelName = input.name.trim();
      const group = input.group.trim() || undefined;
      const entries = normalizeSponsorKeyEntries(input.sponsorKeyEntries);
      const openaiEntry = entries.find((entry) => entry.protocol === 'openai');
      const claudeEntry = entries.find((entry) => entry.protocol === 'claude');
      const codexEntry = entries.find((entry) => entry.protocol === 'codex');
      const geminiEntry = entries.find((entry) => entry.protocol === 'gemini');

      if (definition.protocols.includes('gemini')) {
        const current = raw.gemini[0];
        if (geminiEntry) {
          const next = buildSponsorGeminiConfig(
            geminiEntry,
            channelName,
            group,
            definition.getProtocolUrls,
            current?.config
          );
          if (current) {
            await providersApi.updateGeminiKey(
              { name: current.config.name, index: current.index },
              next
            );
          } else {
            await providersApi.createGeminiKey(next);
          }
        } else {
          for (const item of raw.gemini) {
            await providersApi.deleteGeminiKey({ name: item.config.name, index: item.index });
          }
        }
      }

      const currentCodex = raw.codex[0];
      if (codexEntry) {
        const next = buildSponsorProviderKeyConfig(
          codexEntry,
          'codex',
          channelName,
          group,
          definition.getProtocolUrls,
          currentCodex?.config
        );
        if (currentCodex) {
          await providersApi.updateCodexConfig(
            { name: currentCodex.config.name, index: currentCodex.index },
            next
          );
        } else {
          await providersApi.createCodexConfig(next);
        }
      } else {
        for (const item of raw.codex) {
          await providersApi.deleteCodexConfig({ name: item.config.name, index: item.index });
        }
      }

      const currentClaude = raw.claude[0];
      if (claudeEntry) {
        const next = buildSponsorProviderKeyConfig(
          claudeEntry,
          'claude',
          channelName,
          group,
          definition.getProtocolUrls,
          currentClaude?.config
        );
        if (currentClaude) {
          await providersApi.updateClaudeConfig(
            { name: currentClaude.config.name, index: currentClaude.index },
            next
          );
        } else {
          await providersApi.createClaudeConfig(next);
        }
      } else {
        for (const item of raw.claude) {
          await providersApi.deleteClaudeConfig({ name: item.config.name, index: item.index });
        }
      }

      const currentOpenAI = raw.openai[0];
      if (openaiEntry) {
        const next = buildSponsorOpenAIConfig(
          openaiEntry,
          definition.providerName,
          channelName,
          group,
          definition.getProtocolUrls,
          currentOpenAI?.config
        );
        if (currentOpenAI) {
          await providersApi.updateOpenAIProvider(
            currentOpenAI.config.name,
            currentOpenAI.index,
            next
          );
        } else {
          await providersApi.createOpenAIProvider(next);
        }
      } else if (currentOpenAI) {
        await providersApi.deleteOpenAIProvider(currentOpenAI.index);
      }
    },
    []
  );

  const createProvider = useCallback(
    async (brand: ProviderBrand, input: ProviderEntryFormInput) => {
      setMutating(true);
      try {
        if (brand === 'gemini') {
          await providersApi.createGeminiKey(
            buildProviderKeyConfig('gemini', input) as GeminiKeyConfig
          );
        } else if (brand === 'interactions') {
          await providersApi.createInteractionsKey(
            buildProviderKeyConfig('interactions', input) as GeminiKeyConfig
          );
        } else if (brand === 'codex') {
          await providersApi.createCodexConfig(
            buildProviderKeyConfig('codex', input) as ProviderKeyConfig
          );
        } else if (brand === 'xai') {
          await providersApi.createXAIConfig(
            buildProviderKeyConfig('xai', input) as ProviderKeyConfig
          );
        } else if (brand === 'claude') {
          await providersApi.createClaudeConfig(
            buildProviderKeyConfig('claude', input) as ProviderKeyConfig
          );
        } else if (brand === 'vertex') {
          await providersApi.createVertexConfig(
            buildProviderKeyConfig('vertex', input) as ProviderKeyConfig
          );
        } else if (brand === 'antigravity') {
          await providersApi.createAntigravityConfig(
            buildProviderKeyConfig('antigravity', input) as ProviderKeyConfig
          );
        } else if (brand === 'openaiCompatibility') {
          await providersApi.createOpenAIProvider(buildOpenAIConfig(input));
        } else if (brand === 'lmuAI' || brand === 'kimi') {
          await runSponsorMutationWithRecovery(() => persistSponsorConfig(brand, input), refetch);
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [persistSponsorConfig, refetch]
  );

  const updateProvider = useCallback(
    async (resource: ProviderResource, input: ProviderEntryFormInput) => {
      setMutating(true);
      try {
        const brand = resource.brand;
        const selector = resource.selector;
        if (brand === 'gemini' && selector.brand === 'gemini') {
          const existing = resource.raw as GeminiKeyConfig;
          await providersApi.updateGeminiKey(
            { name: resource.channelName, index: selector.index },
            buildProviderKeyConfig('gemini', input, existing) as GeminiKeyConfig
          );
        } else if (brand === 'interactions' && selector.brand === 'interactions') {
          const existing = resource.raw as GeminiKeyConfig;
          await providersApi.updateInteractionsKey(
            { name: resource.channelName, index: selector.index },
            buildProviderKeyConfig('interactions', input, existing) as GeminiKeyConfig
          );
        } else if (brand === 'codex' && selector.brand === 'codex') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateCodexConfig(
            { name: resource.channelName, index: selector.index },
            buildProviderKeyConfig('codex', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'xai' && selector.brand === 'xai') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateXAIConfig(
            { name: resource.channelName, index: selector.index },
            buildProviderKeyConfig('xai', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'claude' && selector.brand === 'claude') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateClaudeConfig(
            { name: resource.channelName, index: selector.index },
            buildProviderKeyConfig('claude', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'vertex' && selector.brand === 'vertex') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateVertexConfig(
            { name: resource.channelName, index: selector.index },
            buildProviderKeyConfig('vertex', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'antigravity' && selector.brand === 'antigravity') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateAntigravityConfig(
            { name: resource.channelName, index: selector.index },
            buildProviderKeyConfig('antigravity', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'openaiCompatibility' && selector.brand === 'openaiCompatibility') {
          await providersApi.updateOpenAIProvider(
            selector.name,
            selector.index,
            buildOpenAIConfig(input, resource.raw as OpenAIProviderConfig)
          );
        } else if (brand === 'lmuAI' || brand === 'kimi') {
          await runSponsorMutationWithRecovery(
            () => persistSponsorConfig(brand, input, resource.raw as SponsorProviderRaw),
            refetch
          );
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [persistSponsorConfig, refetch]
  );

  const deleteProvider = useCallback(
    async (resource: ProviderResource) => {
      setMutating(true);
      try {
        const sel = resource.selector;
        if (sel.brand === 'gemini') {
          await providersApi.deleteGeminiKey({ name: resource.channelName, index: sel.index });
          const next = (config?.geminiApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('gemini-api-key', next);
        } else if (sel.brand === 'interactions') {
          await providersApi.deleteInteractionsKey({
            name: resource.channelName,
            index: sel.index,
          });
          const next = (config?.interactionsApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('interactions-api-key', next);
        } else if (sel.brand === 'codex') {
          await providersApi.deleteCodexConfig({ name: resource.channelName, index: sel.index });
          const next = (config?.codexApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('codex-api-key', next);
        } else if (sel.brand === 'xai') {
          await providersApi.deleteXAIConfig({ name: resource.channelName, index: sel.index });
          const next = (config?.xaiApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('xai-api-key', next);
        } else if (sel.brand === 'claude') {
          await providersApi.deleteClaudeConfig({ name: resource.channelName, index: sel.index });
          const next = (config?.claudeApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('claude-api-key', next);
        } else if (sel.brand === 'vertex') {
          await providersApi.deleteVertexConfig({ name: resource.channelName, index: sel.index });
          const next = (config?.vertexApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('vertex-api-key', next);
        } else if (sel.brand === 'antigravity') {
          await providersApi.deleteAntigravityConfig({
            name: resource.channelName,
            index: sel.index,
          });
          const next = (config?.antigravityApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('antigravity-api-key', next);
        } else if (sel.brand === 'openaiCompatibility') {
          await providersApi.deleteOpenAIProvider(sel.index);
          const next = (config?.openaiCompatibility ?? []).filter(
            (item, index) => (item.sourceIndex ?? index) !== sel.index
          );
          updateConfigValue('openai-compatibility', next);
        } else if (sel.brand === 'lmuAI' || sel.brand === 'kimi') {
          await runSponsorMutationWithRecovery(async () => {
            const raw = resource.raw as SponsorProviderRaw;
            for (const item of raw.gemini) {
              await providersApi.deleteGeminiKey({ name: item.config.name, index: item.index });
            }
            for (const item of raw.codex) {
              await providersApi.deleteCodexConfig({ name: item.config.name, index: item.index });
            }
            for (const item of raw.claude) {
              await providersApi.deleteClaudeConfig({ name: item.config.name, index: item.index });
            }
            const openAIIndices = raw.openai
              .map((item) => item.index)
              .sort((left, right) => right - left);
            for (const index of openAIIndices) {
              await providersApi.deleteOpenAIProvider(index);
            }
          }, refetch);
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [config, refetch, updateConfigValue]
  );

  const toggleDisabled = useCallback(
    async (resource: ProviderResource, disabled: boolean) => {
      setMutating(true);
      try {
        const brand = resource.brand;
        const selector = resource.selector;
        if (brand === 'gemini' && selector.brand === 'gemini') {
          const current = resource.raw as GeminiKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateGeminiKey(
            { name: resource.channelName, index: selector.index },
            {
              ...current,
              excludedModels: excluded,
            }
          );
        } else if (brand === 'interactions' && selector.brand === 'interactions') {
          const current = resource.raw as GeminiKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateInteractionsKey(
            { name: resource.channelName, index: selector.index },
            {
              ...current,
              excludedModels: excluded,
            }
          );
        } else if (
          (brand === 'codex' && selector.brand === 'codex') ||
          (brand === 'xai' && selector.brand === 'xai') ||
          (brand === 'claude' && selector.brand === 'claude') ||
          (brand === 'vertex' && selector.brand === 'vertex') ||
          (brand === 'antigravity' && selector.brand === 'antigravity')
        ) {
          const current = resource.raw as ProviderKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          const next = { ...current, excludedModels: excluded };
          const match = { name: resource.channelName, index: selector.index };
          if (selector.brand === 'codex') {
            await providersApi.updateCodexConfig(match, next);
          } else if (selector.brand === 'xai') {
            await providersApi.updateXAIConfig(match, next);
          } else if (selector.brand === 'claude') {
            await providersApi.updateClaudeConfig(match, next);
          } else if (selector.brand === 'vertex') {
            await providersApi.updateVertexConfig(match, next);
          } else if (selector.brand === 'antigravity') {
            await providersApi.updateAntigravityConfig(match, next);
          }
        } else if (brand === 'openaiCompatibility' && selector.brand === 'openaiCompatibility') {
          await providersApi.updateOpenAIProviderDisabled(selector.index, disabled);
        } else if (brand === 'lmuAI' || brand === 'kimi') {
          await runSponsorMutationWithRecovery(
            () => toggleSponsorConfig(resource.raw as SponsorProviderRaw, disabled),
            refetch
          );
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  const namesForBrand = useCallback(
    (brand: ProviderBrand): string[] => {
      const named = (items: Array<{ name?: string | null }> | undefined) =>
        (items ?? []).map((item) => item.name ?? '');
      if (brand === 'kimi' || brand === 'lmuAI') {
        return [
          ...named(config?.openaiCompatibility),
          ...named(config?.codexApiKeys),
          ...named(config?.claudeApiKeys),
          ...named(config?.geminiApiKeys),
        ];
      }
      const lists: Partial<Record<ProviderBrand, Array<{ name?: string | null }> | undefined>> = {
        gemini: config?.geminiApiKeys,
        interactions: config?.interactionsApiKeys,
        codex: config?.codexApiKeys,
        xai: config?.xaiApiKeys,
        claude: config?.claudeApiKeys,
        vertex: config?.vertexApiKeys,
        antigravity: config?.antigravityApiKeys,
        openaiCompatibility: config?.openaiCompatibility,
      };
      return named(lists[brand]);
    },
    [config]
  );

  const writeResourceGroup = useCallback(async (resource: ProviderResource, group?: string) => {
    const nextGroup = group?.trim() || undefined;
    if (resource.brand === 'kimi' || resource.brand === 'lmuAI') {
      const raw = resource.raw as SponsorProviderRaw;
      for (const item of raw.gemini) {
        await providersApi.updateGeminiKey(
          { name: item.config.name, index: item.index },
          { ...item.config, group: nextGroup }
        );
      }
      for (const item of raw.codex) {
        await providersApi.updateCodexConfig(
          { name: item.config.name, index: item.index },
          { ...item.config, group: nextGroup }
        );
      }
      for (const item of raw.claude) {
        await providersApi.updateClaudeConfig(
          { name: item.config.name, index: item.index },
          { ...item.config, group: nextGroup }
        );
      }
      for (const item of raw.openai) {
        await providersApi.updateOpenAIProvider(item.config.name, item.index, {
          ...item.config,
          group: nextGroup,
        });
      }
      return;
    }
    const match = { name: resource.channelName, index: resource.originalIndex };
    if (resource.brand === 'gemini') {
      await providersApi.updateGeminiKey(match, {
        ...(resource.raw as GeminiKeyConfig),
        group: nextGroup,
      });
    } else if (resource.brand === 'interactions') {
      await providersApi.updateInteractionsKey(match, {
        ...(resource.raw as GeminiKeyConfig),
        group: nextGroup,
      });
    } else if (resource.brand === 'codex') {
      await providersApi.updateCodexConfig(match, {
        ...(resource.raw as ProviderKeyConfig),
        group: nextGroup,
      });
    } else if (resource.brand === 'xai') {
      await providersApi.updateXAIConfig(match, {
        ...(resource.raw as ProviderKeyConfig),
        group: nextGroup,
      });
    } else if (resource.brand === 'claude') {
      await providersApi.updateClaudeConfig(match, {
        ...(resource.raw as ProviderKeyConfig),
        group: nextGroup,
      });
    } else if (resource.brand === 'vertex') {
      await providersApi.updateVertexConfig(match, {
        ...(resource.raw as ProviderKeyConfig),
        group: nextGroup,
      });
    } else if (resource.brand === 'antigravity') {
      await providersApi.updateAntigravityConfig(match, {
        ...(resource.raw as ProviderKeyConfig),
        group: nextGroup,
      });
    } else if (resource.brand === 'openaiCompatibility') {
      const current = resource.raw as OpenAIProviderConfig;
      await providersApi.updateOpenAIProvider(current.name, resource.originalIndex, {
        ...current,
        group: nextGroup,
      });
    }
  }, []);

  const saveChannelGroups = useCallback(
    async (next: Record<string, ChannelGroupSettings[]>) => {
      await providersApi.putChannelGroups(serializeChannelGroups(next));
      updateConfigValue('channel-groups', next);
    },
    [updateConfigValue]
  );

  const createChannelGroup = useCallback(
    async (brand: ProviderBrand, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setMutating(true);
      try {
        const key = channelGroupKey(brand);
        const current = { ...(config?.channelGroups ?? {}) };
        const list = current[key] ?? [];
        if (!list.some((item) => item.name === trimmed)) {
          current[key] = [...list, emptyChannelGroup(trimmed)];
          await saveChannelGroups(current);
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [config?.channelGroups, refetch, saveChannelGroups]
  );

  const renameChannelGroup = useCallback(
    async (brand: ProviderBrand, from: string, to: string) => {
      const nextName = to.trim();
      const previous = from.trim();
      if (!nextName || nextName === previous) return;
      setMutating(true);
      try {
        const key = channelGroupKey(brand);
        const current = { ...(config?.channelGroups ?? {}) };
        const existing =
          (current[key] ?? []).find((item) => item.name === previous) ??
          emptyChannelGroup(previous);
        const list = (current[key] ?? []).filter(
          (item) => item.name !== previous && item.name !== nextName
        );
        current[key] = [...list, { ...existing, name: nextName }];
        await saveChannelGroups(current);
        const resources = snapshot?.groups.find((group) => group.id === brand)?.resources ?? [];
        for (const resource of resources) {
          if ((resource.group ?? '') === previous) {
            await writeResourceGroup(resource, nextName);
          }
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [config?.channelGroups, refetch, saveChannelGroups, snapshot?.groups, writeResourceGroup]
  );

  const deleteChannelGroup = useCallback(
    async (brand: ProviderBrand, name: string) => {
      const previous = name.trim();
      if (!previous) return;
      setMutating(true);
      try {
        const key = channelGroupKey(brand);
        const current = { ...(config?.channelGroups ?? {}) };
        current[key] = (current[key] ?? []).filter((item) => item.name !== previous);
        if (!current[key]?.length) delete current[key];
        await saveChannelGroups(current);
        const resources = snapshot?.groups.find((group) => group.id === brand)?.resources ?? [];
        for (const resource of resources) {
          if ((resource.group ?? '') === previous) {
            await writeResourceGroup(resource, undefined);
          }
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [config?.channelGroups, refetch, saveChannelGroups, snapshot?.groups, writeResourceGroup]
  );

  const updateChannelGroup = useCallback(
    async (brand: ProviderBrand, settings: ChannelGroupSettings) => {
      const name = settings.name.trim();
      if (!name) return;
      setMutating(true);
      try {
        const key = channelGroupKey(brand);
        const current = { ...(config?.channelGroups ?? {}) };
        const list = current[key] ?? [];
        const next = { ...settings, name };
        current[key] = list.some((item) => item.name === name)
          ? list.map((item) => (item.name === name ? next : item))
          : [...list, next];
        await saveChannelGroups(current);
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [config?.channelGroups, refetch, saveChannelGroups]
  );

  const copyProvider = useCallback(
    async (resource: ProviderResource) => {
      setMutating(true);
      try {
        const name = nextCopyName(resource.channelName, namesForBrand(resource.brand));
        const duplicate = (section: string, match: { name?: string | null; index: number }) =>
          duplicateProviderRecord(section, match, name);
        if (resource.brand === 'kimi' || resource.brand === 'lmuAI') {
          const raw = resource.raw as SponsorProviderRaw;
          for (const item of raw.gemini) {
            await duplicate('gemini-api-key', { name: item.config.name, index: item.index });
          }
          for (const item of raw.codex) {
            await duplicate('codex-api-key', { name: item.config.name, index: item.index });
          }
          for (const item of raw.claude) {
            await duplicate('claude-api-key', { name: item.config.name, index: item.index });
          }
          for (const item of raw.openai) {
            await duplicate('openai-compatibility', {
              name: item.config.name,
              index: item.index,
            });
          }
        } else {
          const sections: Partial<Record<ProviderBrand, string>> = {
            gemini: 'gemini-api-key',
            interactions: 'interactions-api-key',
            codex: 'codex-api-key',
            xai: 'xai-api-key',
            claude: 'claude-api-key',
            vertex: 'vertex-api-key',
            antigravity: 'antigravity-api-key',
            openaiCompatibility: 'openai-compatibility',
          };
          const section = sections[resource.brand];
          if (section) {
            await duplicate(section, {
              name: resource.channelName,
              index: resource.originalIndex,
            });
          }
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [namesForBrand, refetch]
  );

  return {
    connected,
    isPending,
    isFetching,
    isError: Boolean(errorMessage),
    errorMessage,
    snapshot,
    channelGroups: config?.channelGroups ?? {},
    refetch,
    createProvider,
    updateProvider,
    deleteProvider,
    toggleDisabled,
    copyProvider,
    createChannelGroup,
    renameChannelGroup,
    deleteChannelGroup,
    updateChannelGroup,
    mutating,
    refreshSnapshot,
  };
}

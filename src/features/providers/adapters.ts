import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import { hasDisableAllModelsRule, stripDisableAllModelsRule } from '@/components/providers/utils';
import { maskApiKey } from '@/utils/format';
import {
  LMU_AI_DISPLAY_NAME,
  LMU_AI_PROTOCOL_LABELS,
  getLmuAIProtocolUrls,
  resolveLmuAIBaseUrl,
} from './lmuAI';
import {
  KIMI_DISPLAY_NAME,
  KIMI_PROTOCOL_LABELS,
  getKimiProtocolUrls,
  resolveKimiBaseUrl,
} from './kimi';
import { sponsorChannelKey } from './channelIdentity';
import type {
  ProviderBrand,
  ProviderResource,
  ProviderResourceSelector,
  SponsorProviderBrand,
  SponsorProviderRaw,
} from './types';

const countHeaders = (headers?: Record<string, string>): number =>
  headers ? Object.keys(headers).length : 0;

const collectModelNames = (models?: Array<{ name?: string }>): string[] => {
  const seen = new Set<string>();
  (models ?? []).forEach((model) => {
    const name = (model?.name ?? '').trim();
    if (name) seen.add(name);
  });
  return Array.from(seen);
};

const normalizePriority = (priority?: number): number =>
  typeof priority === 'number' && Number.isFinite(priority) ? priority : 0;

const buildId = (brand: ProviderBrand, index: number, fragment: string) =>
  `${brand}:${index}:${fragment || 'item'}`;

const truncateForId = (value: string | undefined | null): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 12) return trimmed;
  return trimmed.slice(0, 8);
};

function providerKeyIdentity(config: GeminiKeyConfig | ProviderKeyConfig): string {
  const apiKey = config.apiKey ?? '';
  if (apiKey.trim()) return apiKey;
  const keyed = config as ProviderKeyConfig;
  const email = keyed.email?.trim();
  if (email) return email;
  const projectId = keyed.projectId?.trim();
  if (projectId) return projectId;
  const sa = keyed.serviceAccount;
  if (sa && typeof sa === 'object') {
    const saEmail = typeof sa.client_email === 'string' ? sa.client_email.trim() : '';
    if (saEmail) return saEmail;
    const saProject = typeof sa.project_id === 'string' ? sa.project_id.trim() : '';
    if (saProject) return saProject;
  }
  return '';
}

function providerKeyToResource(
  brand: 'gemini' | 'interactions' | 'codex' | 'xai' | 'claude' | 'vertex' | 'antigravity',
  config: GeminiKeyConfig | ProviderKeyConfig,
  index: number
): ProviderResource {
  const apiKey = config.apiKey ?? '';
  const identity = providerKeyIdentity(config);
  const channelName = String(config.name ?? '').trim();
  const group = String(config.group ?? '').trim();
  const disabled = hasDisableAllModelsRule(config.excludedModels);
  const flags: ProviderResource['flags'] = {};
  if (brand === 'codex' || brand === 'xai') {
    flags.websockets = (config as ProviderKeyConfig).websockets === true;
  }
  if (brand === 'claude') {
    const claudeConfig = config as ProviderKeyConfig;
    flags.cloakEnabled = Boolean(claudeConfig.cloak?.mode?.trim());
    flags.claudeCodeCliProfile = claudeConfig.fingerprintProfile === 'claude-code-cli';
  }

  const selector: ProviderResourceSelector = {
    brand,
    apiKey,
    baseUrl: config.baseUrl,
    index,
  } as ProviderResourceSelector;

  return {
    id: buildId(brand, index, truncateForId(identity) || `#${index}`),
    brand,
    originalIndex: index,
    name: channelName || null,
    channelName: channelName || null,
    group: group || null,
    identifier: channelName || (apiKey ? maskApiKey(apiKey) : identity) || `#${index + 1}`,
    apiKeyPreview: apiKey ? maskApiKey(apiKey) : null,
    apiKey: apiKey || null,
    authIndex: config.authIndex ?? null,
    baseUrl: config.baseUrl ?? null,
    proxyUrl: config.proxyUrl ?? null,
    prefix: config.prefix ?? null,
    modelCount: config.models?.length ?? 0,
    models: collectModelNames(config.models),
    priority: normalizePriority(config.priority),
    headerCount: countHeaders(config.headers),
    excludedModelCount: stripDisableAllModelsRule(config.excludedModels).length,
    apiKeyEntryCount: 0,
    disabled,
    flags,
    selector,
    raw: config,
  };
}

export function geminiToResource(config: GeminiKeyConfig, index: number): ProviderResource {
  return providerKeyToResource('gemini', config, index);
}

export function interactionsToResource(config: GeminiKeyConfig, index: number): ProviderResource {
  return providerKeyToResource('interactions', config, index);
}

export function codexToResource(config: ProviderKeyConfig, index: number): ProviderResource {
  return providerKeyToResource('codex', config, index);
}

export function xaiToResource(config: ProviderKeyConfig, index: number): ProviderResource {
  return providerKeyToResource('xai', config, index);
}

export function claudeToResource(config: ProviderKeyConfig, index: number): ProviderResource {
  return providerKeyToResource('claude', config, index);
}

export function vertexToResource(config: ProviderKeyConfig, index: number): ProviderResource {
  return providerKeyToResource('vertex', config, index);
}

export function antigravityToResource(config: ProviderKeyConfig, index: number): ProviderResource {
  return providerKeyToResource('antigravity', config, index);
}

export function openaiToResource(config: OpenAIProviderConfig, index: number): ProviderResource {
  const sourceIndex = config.sourceIndex ?? index;
  const name = (config.name ?? '').trim();
  const group = String(config.group ?? '').trim();
  const firstEntry = config.apiKeyEntries?.[0];
  const previewApiKey = firstEntry?.apiKey ? maskApiKey(firstEntry.apiKey) : null;
  return {
    id: buildId('openaiCompatibility', sourceIndex, truncateForId(name) || `#${sourceIndex}`),
    brand: 'openaiCompatibility',
    originalIndex: sourceIndex,
    name: name || null,
    channelName: name || null,
    group: group || null,
    identifier: name || `#${sourceIndex + 1}`,
    apiKeyPreview: previewApiKey,
    apiKey: null,
    authIndex: config.authIndex ?? null,
    baseUrl: config.baseUrl ?? null,
    proxyUrl: null,
    prefix: config.prefix ?? null,
    modelCount: config.models?.length ?? 0,
    models: collectModelNames(config.models),
    priority: normalizePriority(config.priority),
    headerCount: countHeaders(config.headers),
    excludedModelCount: 0,
    apiKeyEntryCount: config.apiKeyEntries?.length ?? 0,
    disabled: config.disabled === true,
    flags: {},
    selector: { brand: 'openaiCompatibility', name, index: sourceIndex },
    raw: config,
  };
}

interface SponsorResourceOptions {
  displayName: string;
  legacyName: string;
  channelName?: string;
  group?: string;
  protocolLabels: readonly string[];
  resolveBaseUrl: (value: string | undefined | null) => string;
  getProtocolUrls: (value: string | undefined | null) => {
    anthropic: string;
    openai: string;
    codex: string;
    gemini: string;
  };
}

function sponsorRawToResource(
  brand: SponsorProviderBrand,
  raw: SponsorProviderRaw,
  options: SponsorResourceOptions
): ProviderResource | null {
  if (
    raw.openai.length === 0 &&
    raw.claude.length === 0 &&
    raw.codex.length === 0 &&
    raw.gemini.length === 0
  ) {
    return null;
  }
  const openaiKeyCount = raw.openai.reduce(
    (count, item) => count + (item.config.apiKeyEntries?.length ?? 0),
    0
  );
  const codexKeyCount = raw.codex.length;
  const geminiKeyCount = raw.gemini.length;
  const firstOpenAIEntry = raw.openai
    .flatMap((item) => item.config.apiKeyEntries ?? [])
    .find((entry) => entry.apiKey?.trim());
  const firstCodex = raw.codex.find((item) => item.config.apiKey?.trim());
  const firstClaude = raw.claude.find((item) => item.config.apiKey?.trim());
  const firstGemini = raw.gemini.find((item) => item.config.apiKey?.trim());
  const apiKey =
    firstOpenAIEntry?.apiKey ??
    firstCodex?.config.apiKey ??
    firstClaude?.config.apiKey ??
    firstGemini?.config.apiKey ??
    '';
  const openaiDisabled =
    raw.openai.length > 0 && raw.openai.every((item) => item.config.disabled === true);
  const codexDisabled =
    raw.codex.length > 0 &&
    raw.codex.every((item) => hasDisableAllModelsRule(item.config.excludedModels));
  const claudeDisabled =
    raw.claude.length > 0 &&
    raw.claude.every((item) => hasDisableAllModelsRule(item.config.excludedModels));
  const geminiDisabled =
    raw.gemini.length > 0 &&
    raw.gemini.every((item) => hasDisableAllModelsRule(item.config.excludedModels));
  const enabledCount =
    (raw.openai.length > 0 && !openaiDisabled ? 1 : 0) +
    (raw.codex.length > 0 && !codexDisabled ? 1 : 0) +
    (raw.claude.length > 0 && !claudeDisabled ? 1 : 0) +
    (raw.gemini.length > 0 && !geminiDisabled ? 1 : 0);
  const allResourcesConfigured =
    raw.openai.length > 0 || raw.codex.length > 0 || raw.claude.length > 0 || raw.gemini.length > 0;
  const disabled = allResourcesConfigured && enabledCount === 0;
  const models = [
    ...raw.openai.flatMap((item) => collectModelNames(item.config.models)),
    ...raw.codex.flatMap((item) => collectModelNames(item.config.models)),
    ...raw.claude.flatMap((item) => collectModelNames(item.config.models)),
    ...raw.gemini.flatMap((item) => collectModelNames(item.config.models)),
  ];
  const uniqueModels = Array.from(new Set(models));
  const headerCount =
    raw.openai.reduce((count, item) => count + countHeaders(item.config.headers), 0) +
    raw.codex.reduce((count, item) => count + countHeaders(item.config.headers), 0) +
    raw.claude.reduce((count, item) => count + countHeaders(item.config.headers), 0) +
    raw.gemini.reduce((count, item) => count + countHeaders(item.config.headers), 0);
  const priority = Math.max(
    0,
    ...raw.openai.map((item) => normalizePriority(item.config.priority)),
    ...raw.codex.map((item) => normalizePriority(item.config.priority)),
    ...raw.claude.map((item) => normalizePriority(item.config.priority)),
    ...raw.gemini.map((item) => normalizePriority(item.config.priority))
  );
  const baseUrl = options.resolveBaseUrl(
    raw.openai[0]?.config.baseUrl ??
      raw.codex[0]?.config.baseUrl ??
      raw.claude[0]?.config.baseUrl ??
      raw.gemini[0]?.config.baseUrl
  );
  const protocolUrls = options.getProtocolUrls(baseUrl);
  const channelName = String(options.channelName ?? '').trim();
  const group = String(options.group ?? '').trim();
  const displayName = channelName || options.displayName;

  return {
    id: buildId(brand, 0, channelName || 'legacy'),
    brand,
    originalIndex: 0,
    name: displayName,
    channelName: channelName || null,
    group: group || null,
    identifier: displayName,
    apiKeyPreview: apiKey ? maskApiKey(apiKey) : null,
    apiKey: apiKey || null,
    authIndex: null,
    baseUrl: [protocolUrls.openai, protocolUrls.anthropic, protocolUrls.gemini]
      .filter(Boolean)
      .join(' / '),
    proxyUrl:
      firstOpenAIEntry?.proxyUrl ??
      raw.codex.find((item) => item.config.proxyUrl)?.config.proxyUrl ??
      raw.claude.find((item) => item.config.proxyUrl)?.config.proxyUrl ??
      raw.gemini.find((item) => item.config.proxyUrl)?.config.proxyUrl ??
      null,
    prefix:
      raw.openai[0]?.config.prefix ??
      raw.codex[0]?.config.prefix ??
      raw.claude[0]?.config.prefix ??
      raw.gemini[0]?.config.prefix ??
      null,
    modelCount: uniqueModels.length,
    models: uniqueModels,
    priority,
    headerCount,
    excludedModelCount:
      raw.codex.reduce(
        (count, item) => count + stripDisableAllModelsRule(item.config.excludedModels).length,
        0
      ) +
      raw.claude.reduce(
        (count, item) => count + stripDisableAllModelsRule(item.config.excludedModels).length,
        0
      ) +
      raw.gemini.reduce(
        (count, item) => count + stripDisableAllModelsRule(item.config.excludedModels).length,
        0
      ),
    apiKeyEntryCount: openaiKeyCount + codexKeyCount + raw.claude.length + geminiKeyCount,
    disabled,
    flags: {
      protocols: [...options.protocolLabels],
    },
    selector: {
      brand,
      openaiIndices: raw.openai.map((item) => item.index),
      claudeIndices: raw.claude.map((item) => item.index),
      codexIndices: raw.codex.map((item) => item.index),
      geminiIndices: raw.gemini.map((item) => item.index),
    } as ProviderResourceSelector,
    raw,
  };
}

const sharedGroup = (names: Array<string | undefined>): string => {
  const trimmed = names.map((name) => String(name ?? '').trim());
  if (!trimmed.length) return '';
  const first = trimmed[0];
  return trimmed.every((name) => name === first) ? first : '';
};

const splitSponsorRaw = (
  raw: SponsorProviderRaw,
  legacyName: string
): Array<{ channelName: string; group: string; raw: SponsorProviderRaw }> => {
  const buckets = new Map<string, SponsorProviderRaw>();
  const ensure = (key: string): SponsorProviderRaw => {
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: SponsorProviderRaw = { openai: [], claude: [], codex: [], gemini: [] };
    buckets.set(key, created);
    return created;
  };
  raw.openai.forEach((item) => {
    ensure(sponsorChannelKey(item.config.name, legacyName)).openai.push(item);
  });
  raw.claude.forEach((item) => {
    ensure(sponsorChannelKey(item.config.name, legacyName)).claude.push(item);
  });
  raw.codex.forEach((item) => {
    ensure(sponsorChannelKey(item.config.name, legacyName)).codex.push(item);
  });
  raw.gemini.forEach((item) => {
    ensure(sponsorChannelKey(item.config.name, legacyName)).gemini.push(item);
  });
  const keys = Array.from(buckets.keys()).sort((left, right) => {
    if (!left) return -1;
    if (!right) return 1;
    return left.localeCompare(right);
  });
  return keys.map((channelName) => {
    const bucket = buckets.get(channelName) ?? { openai: [], claude: [], codex: [], gemini: [] };
    return {
      channelName,
      group: sharedGroup([
        ...bucket.openai.map((item) => item.config.group),
        ...bucket.claude.map((item) => item.config.group),
        ...bucket.codex.map((item) => item.config.group),
        ...bucket.gemini.map((item) => item.config.group),
      ]),
      raw: bucket,
    };
  });
};

const sponsorResources = (
  brand: SponsorProviderBrand,
  raw: SponsorProviderRaw,
  options: Omit<SponsorResourceOptions, 'channelName' | 'group'>
): ProviderResource[] =>
  splitSponsorRaw(raw, options.legacyName).flatMap((bucket) => {
    const resource = sponsorRawToResource(brand, bucket.raw, {
      ...options,
      channelName: bucket.channelName,
      group: bucket.group,
    });
    return resource ? [resource] : [];
  });

export function lmuAIToResources(raw: SponsorProviderRaw): ProviderResource[] {
  return sponsorResources('lmuAI', raw, {
    displayName: LMU_AI_DISPLAY_NAME,
    legacyName: 'lmuAI',
    protocolLabels: LMU_AI_PROTOCOL_LABELS,
    resolveBaseUrl: resolveLmuAIBaseUrl,
    getProtocolUrls: getLmuAIProtocolUrls,
  });
}

export function lmuAIToResource(raw: SponsorProviderRaw): ProviderResource | null {
  return lmuAIToResources(raw)[0] ?? null;
}

export function kimiToResources(raw: SponsorProviderRaw): ProviderResource[] {
  return sponsorResources('kimi', raw, {
    displayName: KIMI_DISPLAY_NAME,
    legacyName: 'kimi',
    protocolLabels: KIMI_PROTOCOL_LABELS,
    resolveBaseUrl: resolveKimiBaseUrl,
    getProtocolUrls: getKimiProtocolUrls,
  });
}

export function kimiToResource(raw: SponsorProviderRaw): ProviderResource | null {
  return kimiToResources(raw)[0] ?? null;
}

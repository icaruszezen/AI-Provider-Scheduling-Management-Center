import {
  findProviderRecentUsageEntry,
  getProviderUsageKey,
  type ProviderRecentUsageMap,
} from '@/components/providers/utils';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import { isMultiProtocolSponsorBrand } from './sponsorDefinitions';
import type { ProviderResource, SponsorProviderRaw } from './types';

export interface ConnectionCapacitySummary {
  unlimited: boolean;
  active: number;
  max: number;
  available: number;
}

interface ChannelPart {
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  channelName?: string | null;
  configuredMax: number;
}

const configuredMax = (value: number | null | undefined): number => {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
};

const summarizeParts = (
  parts: ChannelPart[],
  usageByProvider?: ProviderRecentUsageMap
): ConnectionCapacitySummary => {
  if (parts.length === 0) {
    return { unlimited: true, active: 0, max: 0, available: 0 };
  }

  let active = 0;
  let max = 0;
  let unlimited = false;
  for (const part of parts) {
    const found = usageByProvider
      ? findProviderRecentUsageEntry(
          usageByProvider,
          part.provider,
          part.apiKey ?? undefined,
          part.baseUrl ?? undefined,
          part.channelName ?? undefined
        )
      : null;
    const partMax = found ? found.maxConnections : part.configuredMax;
    active += found ? found.activeConnections : 0;
    if (partMax <= 0) {
      unlimited = true;
      continue;
    }
    max += partMax;
  }

  if (unlimited) {
    return { unlimited: true, active, max: 0, available: 0 };
  }
  return {
    unlimited: false,
    active,
    max,
    available: Math.max(0, max - active),
  };
};

const keyParts = (
  provider: string,
  config: ProviderKeyConfig | GeminiKeyConfig
): ChannelPart[] => [
  {
    provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    channelName: config.name,
    configuredMax: configuredMax(config.maxConcurrentConnections),
  },
];

const openAIParts = (config: OpenAIProviderConfig): ChannelPart[] => {
  const limit = configuredMax(config.maxConcurrentConnections);
  const entries = config.apiKeyEntries ?? [];
  if (entries.length === 0) {
    return [
      {
        provider: config.name,
        baseUrl: config.baseUrl,
        configuredMax: limit,
      },
    ];
  }
  return entries.map((entry) => ({
    provider: config.name,
    apiKey: entry.apiKey,
    baseUrl: config.baseUrl,
    configuredMax: limit,
  }));
};

const sponsorParts = (raw: SponsorProviderRaw): ChannelPart[] => [
  ...raw.openai.flatMap((item) => openAIParts(item.config)),
  ...raw.claude.flatMap((item) => keyParts('claude', item.config)),
  ...raw.codex.flatMap((item) => keyParts('codex', item.config)),
  ...raw.gemini.flatMap((item) => keyParts('gemini', item.config)),
];

export function summarizeResourceConnectionCapacity(
  resource: ProviderResource,
  usageByProvider?: ProviderRecentUsageMap
): ConnectionCapacitySummary {
  if (isMultiProtocolSponsorBrand(resource.brand)) {
    return summarizeParts(sponsorParts(resource.raw as SponsorProviderRaw), usageByProvider);
  }
  if (resource.brand === 'openaiCompatibility') {
    return summarizeParts(openAIParts(resource.raw as OpenAIProviderConfig), usageByProvider);
  }
  const config = resource.raw as ProviderKeyConfig | GeminiKeyConfig;
  return summarizeParts(
    keyParts(getProviderUsageKey(resource.brand), config),
    usageByProvider
  );
}

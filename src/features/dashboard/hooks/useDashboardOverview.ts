import { useCallback, useEffect, useMemo } from 'react';
import { useAuthStore, useConfigStore, useModelsStore } from '@/stores';
import { useApiKeysForModels } from '@/hooks/useApiKeysForModels';
import { useProviderRecentRequests } from '@/components/providers/hooks/useProviderRecentRequests';
import { mergeRecentRequestBucketGroups, type RecentRequestBucket } from '@/utils/recentRequests';
import type { Config } from '@/types';
import {
  TRAFFIC_BUCKET_MINUTES,
  type DashboardCounts,
  type ProviderTraffic,
  type TrafficWindow,
} from '../types';

const EMPTY_TRAFFIC: TrafficWindow = {
  buckets: [],
  totalSuccess: 0,
  totalFailure: 0,
  total: 0,
  successRate: null,
  peakTotal: 0,
  peakIndex: -1,
  activeBuckets: 0,
  windowMinutes: 0,
};

const buildTrafficWindow = (bucketGroups: RecentRequestBucket[][]): TrafficWindow => {
  const buckets = mergeRecentRequestBucketGroups(bucketGroups);
  if (buckets.length === 0) {
    return EMPTY_TRAFFIC;
  }

  let totalSuccess = 0;
  let totalFailure = 0;
  let peakTotal = 0;
  let peakIndex = -1;
  let activeBuckets = 0;

  buckets.forEach((bucket, index) => {
    const bucketTotal = bucket.success + bucket.failed;
    totalSuccess += bucket.success;
    totalFailure += bucket.failed;
    if (bucketTotal > 0) {
      activeBuckets += 1;
    }
    if (bucketTotal > peakTotal) {
      peakTotal = bucketTotal;
      peakIndex = index;
    }
  });

  const total = totalSuccess + totalFailure;

  return {
    buckets,
    totalSuccess,
    totalFailure,
    total,
    successRate: total > 0 ? (totalSuccess / total) * 100 : null,
    peakTotal,
    peakIndex,
    activeBuckets,
    windowMinutes: buckets.length * TRAFFIC_BUCKET_MINUTES,
  };
};

interface ProviderAccumulator {
  credentials: number;
  success: number;
  failure: number;
  bucketGroups: RecentRequestBucket[][];
}

const createAccumulator = (): ProviderAccumulator => ({
  credentials: 0,
  success: 0,
  failure: 0,
  bucketGroups: [],
});

export const getProviderKeyCounts = (config: Config) => ({
  gemini: config.geminiApiKeys?.length ?? 0,
  interactions: config.interactionsApiKeys?.length ?? 0,
  codex: config.codexApiKeys?.length ?? 0,
  xai: config.xaiApiKeys?.length ?? 0,
  claude: config.claudeApiKeys?.length ?? 0,
  vertex: config.vertexApiKeys?.length ?? 0,
  antigravity: config.antigravityApiKeys?.length ?? 0,
  openai: config.openaiCompatibility?.length ?? 0,
});

/**
 * 汇总仪表盘所需的全部数据。
 *
 * 流量只来自入站 `api-key-usage`（配置内联的 API Key 凭证）与供应商近期请求。
 */
export function useDashboardOverview() {
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const connected = connectionStatus === 'connected';
  const resolveApiKeysForModels = useApiKeysForModels();

  const { usageByProvider, refreshRecentRequests } = useProviderRecentRequests({
    enabled: connected,
  });

  const loadModels = useCallback(async () => {
    if (!connected || !apiBase) return;
    try {
      const apiKeys = await resolveApiKeysForModels();
      await fetchModelsFromStore(apiBase, apiKeys[0]);
    } catch {
      // 模型列表失败不应影响仪表盘其余部分
    }
  }, [connected, apiBase, resolveApiKeysForModels, fetchModelsFromStore]);

  useEffect(() => {
    if (!connected) return;
    void fetchConfig().catch(() => undefined);
    void loadModels();
  }, [connected, fetchConfig, loadModels]);

  const refresh = useCallback(async () => {
    if (!connected) return;
    await Promise.allSettled([fetchConfig(true), loadModels(), refreshRecentRequests()]);
  }, [connected, fetchConfig, loadModels, refreshRecentRequests]);

  const providerKeyCounts = useMemo(() => (config ? getProviderKeyCounts(config) : null), [config]);

  const { traffic, providers } = useMemo(() => {
    const accumulators = new Map<string, ProviderAccumulator>();
    const allBucketGroups: RecentRequestBucket[][] = [];

    const accumulatorFor = (providerId: string): ProviderAccumulator => {
      const existing = accumulators.get(providerId);
      if (existing) return existing;
      const created = createAccumulator();
      accumulators.set(providerId, created);
      return created;
    };

    usageByProvider.forEach((entriesByKey, providerId) => {
      const accumulator = accumulatorFor(providerId);
      entriesByKey.forEach((entry) => {
        accumulator.credentials += 1;
        accumulator.success += entry.success;
        accumulator.failure += entry.failed;
        if (entry.recentRequests.length > 0) {
          accumulator.bucketGroups.push(entry.recentRequests);
          allBucketGroups.push(entry.recentRequests);
        }
      });
    });

    const providerRows: ProviderTraffic[] = Array.from(accumulators.entries())
      .map(([id, accumulator]) => {
        const total = accumulator.success + accumulator.failure;
        return {
          id,
          credentials: accumulator.credentials,
          success: accumulator.success,
          failure: accumulator.failure,
          total,
          successRate: total > 0 ? (accumulator.success / total) * 100 : null,
          buckets: mergeRecentRequestBucketGroups(accumulator.bucketGroups),
        };
      })
      .sort(
        (a, b) => b.total - a.total || b.credentials - a.credentials || a.id.localeCompare(b.id)
      );

    return {
      traffic: buildTrafficWindow(allBucketGroups),
      providers: providerRows,
    };
  }, [usageByProvider]);

  const counts = useMemo<DashboardCounts>(
    () => ({
      managementKeys: config ? (config.apiKeys?.length ?? 0) : null,
      providerKeys: providerKeyCounts
        ? Object.values(providerKeyCounts).reduce((sum, count) => sum + count, 0)
        : null,
      models: modelsLoading || modelsError ? null : models.length,
    }),
    [config, providerKeyCounts, models.length, modelsLoading, modelsError]
  );

  return {
    connectionStatus,
    connected,
    config,
    counts,
    providerKeyCounts,
    traffic,
    providers,
    initialLoading: connected && !config,
    refresh,
  };
}

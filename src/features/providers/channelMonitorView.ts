import type { OpenAIProviderConfig } from '@/types';
import type { StatusBarData } from '@/utils/recentRequests';
import type { ProviderResource } from './types';

export const MONITOR_RANGES = ['90m', '24h', '7d', '30d'] as const;
export type MonitorRange = (typeof MONITOR_RANGES)[number];

export interface MonitorMetric {
  success_requests: number;
  error_requests: number;
  request_count: number;
  error_rate: number;
  success_rate: number;
  cache_rate: number;
  rpm: number;
  tpm: number;
  ttft?: { p50_ms?: number; sample_count?: number };
  duration?: { p50_ms?: number };
}

export interface MonitorHealth {
  overall: string;
  score?: number;
}

export interface MonitorBucket {
  bucket_start: string;
  metrics: MonitorMetric;
  health?: MonitorHealth;
}

export interface MonitorSummaryItem {
  provider: string;
  auth_index: string;
  label?: string;
  api_key_masked?: string;
  present?: boolean;
  metrics: MonitorMetric;
  health: MonitorHealth;
  buckets: MonitorBucket[];
}

export interface MonitorSummaries {
  enabled: boolean;
  range: string;
  coverage?: { coverage_complete?: boolean };
  items: MonitorSummaryItem[];
}

export interface ResourceMonitorView {
  success: number;
  failure: number;
  health: string;
  statusBar: StatusBarData;
  authIndexes: string[];
}

const HEALTH_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
  unknown: 3,
};

export function collectResourceAuthIndexes(resource: ProviderResource): string[] {
  const indexes = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) indexes.add(trimmed);
  };
  add(resource.authIndex);
  if (resource.brand === 'openaiCompatibility') {
    const raw = resource.raw as OpenAIProviderConfig;
    add(raw.authIndex);
    for (const entry of raw.apiKeyEntries ?? []) add(entry.authIndex);
  }
  return [...indexes];
}

export function resourceMonitorView(
  resource: ProviderResource,
  summaries: MonitorSummaries | null | undefined
): ResourceMonitorView | null {
  if (!summaries?.enabled) return null;
  const authIndexes = collectResourceAuthIndexes(resource);
  if (authIndexes.length === 0) return null;
  const wanted = new Set(authIndexes);
  const items = summaries.items.filter((item) => wanted.has(item.auth_index));
  if (items.length === 0) return null;
  const success = items.reduce((total, item) => total + item.metrics.success_requests, 0);
  const failure = items.reduce((total, item) => total + item.metrics.error_requests, 0);
  if (success + failure <= 0) return null;
  return {
    success,
    failure,
    health: worstHealth(items.map((item) => item.health.overall)),
    statusBar: statusBarFromItems(items),
    authIndexes,
  };
}

export function worstHealth(values: string[]): string {
  if (values.length === 0) return 'unknown';
  return [...values].sort((left, right) => (HEALTH_RANK[left] ?? 3) - (HEALTH_RANK[right] ?? 3))[0];
}

export function statusBarFromItems(items: MonitorSummaryItem[]): StatusBarData {
  const byStart = new Map<string, { success: number; failure: number }>();
  for (const item of items) {
    for (const bucket of item.buckets ?? []) {
      const current = byStart.get(bucket.bucket_start) ?? { success: 0, failure: 0 };
      current.success += bucket.metrics?.success_requests ?? 0;
      current.failure += bucket.metrics?.error_requests ?? 0;
      byStart.set(bucket.bucket_start, current);
    }
  }
  const starts = [...byStart.keys()].sort();
  let totalSuccess = 0;
  let totalFailure = 0;
  const blockDetails = starts.map((start) => {
    const bucket = byStart.get(start)!;
    totalSuccess += bucket.success;
    totalFailure += bucket.failure;
    const total = bucket.success + bucket.failure;
    const startTime = Date.parse(start);
    return {
      success: bucket.success,
      failure: bucket.failure,
      rate: total > 0 ? bucket.success / total : -1,
      startTime: Number.isNaN(startTime) ? 0 : startTime,
      endTime: Number.isNaN(startTime) ? 0 : startTime,
    };
  });
  const total = totalSuccess + totalFailure;
  return {
    blocks: blockDetails.map((detail) => {
      if (detail.success + detail.failure === 0) return 'idle';
      if (detail.failure === 0) return 'success';
      if (detail.success === 0) return 'failure';
      return 'mixed';
    }),
    blockDetails,
    successRate: total > 0 ? (totalSuccess / total) * 100 : 100,
    totalSuccess,
    totalFailure,
  };
}

export function monitorQuery(range: MonitorRange, authIndexes: string[]): string {
  const search = new URLSearchParams();
  search.set('range', range);
  for (const authIndex of authIndexes) {
    if (authIndex) search.append('auth_index', authIndex);
  }
  return search.toString();
}

export function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 1000) / 10}%`;
}

export function formatMs(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} ms`;
}

import type {
  MonitorRange,
  MonitorSummaries,
} from '@/features/providers/channelMonitorView';
import { apiClient } from './client';

export interface MonitorSnapshot {
  enabled: boolean;
  range: string;
  coverage?: { coverage_complete?: boolean };
  metrics: {
    success_requests: number;
    error_requests: number;
    request_count: number;
    error_rate: number;
    cache_rate: number;
    rpm: number;
    tpm: number;
    ttft?: { p50_ms?: number };
  };
  health: { overall: string; score?: number };
  trend: Array<{
    bucket_start: string;
    metrics: { success_requests: number; error_requests: number; error_rate: number };
    health: { overall: string };
  }>;
}

export interface MonitorModels {
  items: Array<{
    model: string;
    auth_index: string;
    metrics: { request_count: number; success_rate: number; error_rate: number; ttft?: { p50_ms?: number } };
    health: { overall: string };
  }>;
}

export interface MonitorErrors {
  items: Array<{
    category: string;
    count: number;
    rate: number;
    ignored: boolean;
    details?: Array<{ model: string; status_code: number; message?: string; count: number }>;
  }>;
}

const query = (range: MonitorRange, authIndexes: string[]) => {
  const search = new URLSearchParams();
  search.set('range', range);
  authIndexes.forEach((authIndex) => {
    if (authIndex) search.append('auth_index', authIndex);
  });
  return search.toString();
};

export const channelMonitorApi = {
  summaries: (range: MonitorRange = '90m') =>
    apiClient.get<MonitorSummaries>(`/channel-monitor/summaries?range=${range}`),
  snapshot: (range: MonitorRange, authIndexes: string[]) =>
    apiClient.get<MonitorSnapshot>(`/channel-monitor/snapshot?${query(range, authIndexes)}`),
  models: (range: MonitorRange, authIndexes: string[]) =>
    apiClient.get<MonitorModels>(`/channel-monitor/models?${query(range, authIndexes)}`),
  errors: (range: MonitorRange, authIndexes: string[]) =>
    apiClient.get<MonitorErrors>(`/channel-monitor/errors?${query(range, authIndexes)}`),
};

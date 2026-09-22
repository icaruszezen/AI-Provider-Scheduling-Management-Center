import { describe, expect, test } from 'bun:test';
import {
  collectResourceAuthIndexes,
  formatRatio,
  monitorQuery,
  resourceMonitorView,
  statusBarFromItems,
  worstHealth,
  type MonitorSummaries,
} from '@/features/providers/channelMonitorView';
import type { ProviderResource } from '@/features/providers/types';

const resource = {
  brand: 'openaiCompatibility',
  authIndex: null,
  raw: {
    apiKeyEntries: [{ apiKey: 'a', authIndex: 'auth-1' }, { apiKey: 'b', authIndex: 'auth-2' }],
  },
} as ProviderResource;

describe('channel monitor view', () => {
  test('collects every openai key auth index', () => {
    expect(collectResourceAuthIndexes(resource)).toEqual(['auth-1', 'auth-2']);
  });

  test('builds a 90 minute query for the selected credentials', () => {
    expect(monitorQuery('90m', ['auth-1', 'auth-2'])).toBe(
      'range=90m&auth_index=auth-1&auth_index=auth-2'
    );
  });

  test('uses v2 summaries for the thumbnail and falls back when there is no traffic', () => {
    const summaries: MonitorSummaries = {
      enabled: true,
      range: '90m',
      items: [
        {
          provider: 'gemini',
          auth_index: 'auth-1',
          metrics: {
            success_requests: 8,
            error_requests: 2,
            request_count: 10,
            error_rate: 0.2,
            success_rate: 0.8,
            cache_rate: 0,
            rpm: 1,
            tpm: 1,
          },
          health: { overall: 'warning' },
          buckets: [
            {
              bucket_start: '2026-09-22T02:00:00Z',
              metrics: {
                success_requests: 8,
                error_requests: 2,
                request_count: 10,
                error_rate: 0.2,
                success_rate: 0.8,
                cache_rate: 0,
                rpm: 1,
                tpm: 1,
              },
            },
          ],
        },
      ],
    };
    const view = resourceMonitorView(resource, summaries);
    expect(view?.success).toBe(8);
    expect(view?.failure).toBe(2);
    expect(view?.health).toBe('warning');
    expect(view?.statusBar.blockDetails).toHaveLength(1);
    expect(view?.statusBar.successRate).toBe(80);
    expect(resourceMonitorView(resource, { ...summaries, enabled: false })).toBeNull();
  });

  test('picks the worse health band and formats rates', () => {
    expect(worstHealth(['healthy', 'critical', 'unknown'])).toBe('critical');
    expect(formatRatio(0.9)).toBe('90%');
    expect(statusBarFromItems([]).blockDetails).toEqual([]);
  });
});

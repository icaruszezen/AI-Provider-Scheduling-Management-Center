import { describe, expect, test } from 'bun:test';
import { normalizeGeminiKeyConfig, normalizeOpenAIProvider } from '../src/services/api/transformers';
import { findProviderRecentUsageEntry } from '../src/components/providers/utils';
import { summarizeResourceConnectionCapacity } from '../src/features/providers/connectionCapacity';
import type { ProviderResource } from '../src/features/providers/types';
import {
  applyMaxConcurrentConnectionsPayload,
  maxConcurrentConnectionsForForm,
  maxConcurrentConnectionsFromForm,
  normalizeMaxConcurrentConnections,
} from '../src/utils/maxConcurrentConnections';
import { normalizeRecentRequestUsageEntry } from '../src/utils/recentRequests';

describe('max concurrent connections', () => {
  test('normalizes empty, zero, and out of range values', () => {
    expect(normalizeMaxConcurrentConnections(undefined)).toBeUndefined();
    expect(normalizeMaxConcurrentConnections(null)).toBeUndefined();
    expect(normalizeMaxConcurrentConnections(0)).toBe(0);
    expect(normalizeMaxConcurrentConnections(4.9)).toBe(4);
    expect(normalizeMaxConcurrentConnections(-1)).toBeUndefined();
    expect(normalizeMaxConcurrentConnections(2_000_000)).toBe(1_000_000);
    expect(maxConcurrentConnectionsForForm(0)).toBeUndefined();
    expect(maxConcurrentConnectionsForForm(4)).toBe(4);
    expect(maxConcurrentConnectionsFromForm(undefined)).toBeNull();
    expect(maxConcurrentConnectionsFromForm(0)).toBe(0);
  });

  test('writes null to clear and a number to set', () => {
    const cleared: Record<string, unknown> = {};
    applyMaxConcurrentConnectionsPayload(cleared, { maxConcurrentConnections: null });
    expect(cleared).toEqual({ 'max-concurrent-connections': null });

    const set: Record<string, unknown> = {};
    applyMaxConcurrentConnectionsPayload(set, { maxConcurrentConnections: 8 });
    expect(set).toEqual({ 'max-concurrent-connections': 8 });
  });

  test('reads the field from channel config', () => {
    const gemini = normalizeGeminiKeyConfig({
      'api-key': 'g-1',
      'max-concurrent-connections': 9,
    });
    expect(gemini?.maxConcurrentConnections).toBe(9);

    const omitted = normalizeOpenAIProvider({
      name: 'compat',
      'base-url': 'https://example.test/v1',
    });
    expect(omitted?.maxConcurrentConnections).toBeUndefined();
  });

  test('reads live occupancy from usage', () => {
    const entry = normalizeRecentRequestUsageEntry({
      success: 1,
      failed: 0,
      active_connections: 2,
      max_connections: 4,
    });
    expect(entry.activeConnections).toBe(2);
    expect(entry.maxConnections).toBe(4);
  });

  test('sums remaining capacity across OpenAI keys', () => {
    const resource = {
      brand: 'openaiCompatibility',
      channelName: 'compat',
      raw: {
        name: 'compat',
        baseUrl: 'https://example.test/v1',
        maxConcurrentConnections: 4,
        apiKeyEntries: [{ apiKey: 'a' }, { apiKey: 'b' }],
      },
    } as ProviderResource;
    const usage = new Map([
      [
        'compat',
        new Map([
          [
            'https://example.test/v1|a',
            {
              success: 0,
              failed: 0,
              activeConnections: 1,
              maxConnections: 4,
              recentRequests: [],
            },
          ],
          [
            'https://example.test/v1|b',
            {
              success: 0,
              failed: 0,
              activeConnections: 4,
              maxConnections: 4,
              recentRequests: [],
            },
          ],
        ]),
      ],
    ]);

    expect(findProviderRecentUsageEntry(usage, 'compat', 'a', 'https://example.test/v1')?.activeConnections).toBe(1);
    expect(summarizeResourceConnectionCapacity(resource, usage)).toEqual({
      unlimited: false,
      active: 5,
      max: 8,
      available: 3,
    });
  });

  test('treats an omitted limit as unlimited', () => {
    const resource = {
      brand: 'claude',
      raw: { apiKey: 'sk', name: 'tokyo', baseUrl: 'https://api.anthropic.com' },
    } as ProviderResource;
    expect(summarizeResourceConnectionCapacity(resource)).toEqual({
      unlimited: true,
      active: 0,
      max: 0,
      available: 0,
    });
  });
});

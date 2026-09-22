import { describe, expect, test } from 'bun:test';
import { kimiToResources } from '../src/features/providers/adapters';
import {
  groupChannelResources,
  nextCopyName,
  sponsorChannelKey,
} from '../src/features/providers/channelIdentity';
import { buildKimiRaw } from '../src/features/providers/kimi';
import { KIMI_ANTHROPIC_BASE_URL, KIMI_OPENAI_BASE_URL } from '../src/features/providers/kimi';
import { buildRecentRequestCompositeKey } from '../src/utils/recentRequests';
import type { ProviderResource } from '../src/features/providers/types';

const resource = (group: string | null): ProviderResource =>
  ({
    id: group ?? 'ungrouped',
    group,
    brand: 'codex',
    name: null,
    channelName: null,
    identifier: 'item',
    originalIndex: 0,
  }) as ProviderResource;

describe('channel identity', () => {
  test('keeps unnamed usage keys and separates named channels', () => {
    expect(buildRecentRequestCompositeKey('https://a', 'key')).toBe('https://a|key');
    const tokyo = buildRecentRequestCompositeKey('https://a', 'key', 'tokyo');
    const osaka = buildRecentRequestCompositeKey('https://a', 'key', 'osaka');
    expect(tokyo).not.toBe(osaka);
    expect(tokyo).not.toBe('https://a|key');
  });

  test('builds a unique copy name', () => {
    expect(nextCopyName('tokyo', [])).toBe('tokyo-copy');
    expect(nextCopyName('tokyo', ['tokyo-copy'])).toBe('tokyo-copy-2');
    expect(nextCopyName('', ['copy'])).toBe('copy-2');
  });

  test('treats the sponsor provider name as the legacy card', () => {
    expect(sponsorChannelKey('kimi', 'kimi')).toBe('');
    expect(sponsorChannelKey('kimi-copy', 'kimi')).toBe('kimi-copy');
    expect(sponsorChannelKey('', 'kimi')).toBe('');
  });

  test('splits Kimi channels that share a URL when their names differ', () => {
    const resources = kimiToResources(
      buildKimiRaw({
        openaiCompatibility: [
          {
            name: 'kimi',
            baseUrl: KIMI_OPENAI_BASE_URL,
            apiKeyEntries: [{ apiKey: 'same-key' }],
          },
          {
            name: 'kimi-copy',
            baseUrl: KIMI_OPENAI_BASE_URL,
            apiKeyEntries: [{ apiKey: 'same-key' }],
            group: '备用',
          },
        ],
        claudeApiKeys: [
          { apiKey: 'same-key', baseUrl: KIMI_ANTHROPIC_BASE_URL },
          {
            name: 'kimi-copy',
            apiKey: 'same-key',
            baseUrl: KIMI_ANTHROPIC_BASE_URL,
            group: '备用',
          },
        ],
        codexApiKeys: [],
        geminiApiKeys: [],
      })
    );

    expect(resources.map((item) => item.channelName)).toEqual([null, 'kimi-copy']);
    expect(resources[1]?.group).toBe('备用');
    expect(resources[0]?.name).toBe('Kimi');
  });

  test('shows custom groups and hides an empty ungrouped section', () => {
    const sections = groupChannelResources(
      [resource('生产'), resource('生产')],
      ['生产', '备用'],
      false
    );
    expect(sections.map((section) => section.id)).toEqual(['生产', '备用']);
    expect(sections[0]?.resources).toHaveLength(2);
    expect(sections[1]?.resources).toHaveLength(0);
  });
});

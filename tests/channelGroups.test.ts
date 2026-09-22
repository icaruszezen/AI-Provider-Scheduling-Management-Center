import { describe, expect, test } from 'bun:test';
import { groupChannelResources } from '../src/features/providers/channelIdentity';
import {
  parseChannelGroups,
  serializeChannelGroups,
  validateChannelGroupSettings,
} from '../src/features/providers/channelGroups';
import type { ProviderResource } from '../src/features/providers/types';

const resource = (group: string | null, priority = 0, originalIndex = 0): ProviderResource =>
  ({
    id: `${group ?? 'ungrouped'}-${originalIndex}`,
    group,
    brand: 'codex',
    name: null,
    channelName: null,
    identifier: 'item',
    originalIndex,
    priority,
  }) as ProviderResource;

describe('channel groups', () => {
  test('parses string catalogs and group objects', () => {
    const parsed = parseChannelGroups({
      codex: [
        ' team ',
        {
          name: 'batch',
          'api-keys': [' sk-1 ', 'sk-1', ''],
          'channel-retry-count': 2,
          'channel-retry-status-codes': [429, 429, 500],
          'channel-retry-error-contains': [' overloaded ', 'overloaded'],
        },
      ],
    });
    expect(parsed.codex?.map((group) => group.name)).toEqual(['team', 'batch']);
    expect(parsed.codex?.[1]).toMatchObject({
      apiKeys: ['sk-1'],
      channelRetryCount: 2,
      channelRetryStatusCodes: [429, 500],
      channelRetryErrorContains: ['overloaded'],
    });
  });

  test('serializes only configured retry fields', () => {
    const wire = serializeChannelGroups({
      codex: [
        {
          name: 'batch',
          apiKeys: ['sk-1'],
          channelRetryCount: 0,
          channelRetryStatusCodes: [503],
          channelRetryErrorContains: ['overloaded'],
        },
      ],
    });
    expect(wire.codex?.[0]).toEqual({
      name: 'batch',
      'api-keys': ['sk-1'],
      'channel-retry-count': 0,
      'channel-retry-status-codes': [503],
      'channel-retry-error-contains': ['overloaded'],
    });
  });

  test('rejects invalid retry settings', () => {
    expect(
      validateChannelGroupSettings({
        name: 'batch',
        apiKeys: [' '],
        channelRetryStatusCodes: [],
        channelRetryErrorContains: [],
      })
    ).toBe('emptyKey');
    expect(
      validateChannelGroupSettings({
        name: 'batch',
        apiKeys: [],
        channelRetryCount: 101,
        channelRetryStatusCodes: [],
        channelRetryErrorContains: [],
      })
    ).toBe('retryCount');
    expect(
      validateChannelGroupSettings({
        name: 'batch',
        apiKeys: [],
        channelRetryStatusCodes: [99],
        channelRetryErrorContains: [],
      })
    ).toBe('statusCode');
  });

  test('orders named groups by priority descending', () => {
    const sections = groupChannelResources(
      [resource('生产', 1, 0), resource('生产', 9, 1), resource(null, 5, 2)],
      ['生产'],
      false
    );
    expect(sections[0]?.id).toBe('');
    expect(sections[0]?.resources.map((item) => item.priority)).toEqual([5]);
    expect(sections[1]?.resources.map((item) => item.priority)).toEqual([9, 1]);
  });
});
